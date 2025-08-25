const bcrypt = require("bcryptjs");
const User = require("../../models/user");
const JWT = require("jsonwebtoken");
const formidable = require("formidable");
const cloudinary = require("cloudinary").v2;
const seller = require("../../models/sellers");
const SubscriptionModel = require("../../models/SubscriptionModel");
const webpush = require("web-push");
const products = require("../../models/products");
const sellers = require("../../models/sellers");
// Image upload helper
const uploadImage = async (image) => {
  try {
    console.log("image", image);
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "ecommerce/Image_verifySeller",
          resource_type: "image",
          transformation: [{ width: 500, height: 500, crop: "limit" }],
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result.secure_url);
        }
      );
      // ❗️ส่งเฉพาะ image.buffer
      stream.end(image?.buffer);
    });
  } catch (error) {
    console.error("❌ Cloudinary upload error:", error);
    throw new Error("Image upload failed");
  }
};

const deleteCloudinaryImage = async (imageUrl) => {
  try {
    const publicId = imageUrl.split("/").pop().split(".")[0];
    await cloudinary.uploader.destroy(
      `ecommerce/Image_verifySeller/${publicId}`
    );
  } catch (err) {
    console.error("⚠️ Failed to delete old image from Cloudinary:", err);
  }
};
const register_user_auth = async (req, res, next) => {
  try {
    const { username, password, email, role, phone, agreeTerms } = req.body;

    // Validation
    if (!username || !password || !email) {
      return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" });
    }

    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "ชื่อผู้ใช้หรืออีเมลถูกใช้ไปแล้ว" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // สร้าง user ใหม่ (กำหนด role = "user" โดย default เพื่อความปลอดภัย)
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      phone,
      agreeTerms,
      role: role || "user", // หรือจะ hardcoded ไปเลยก็ได้ เช่น role: "user"
    });

    await newUser.save();

    // สร้าง token หลัง save สำเร็จ
    const token = JWT.sign(
      { _id: newUser._id, role: newUser.role },
      process.env.TOKEN_SECRET,
      { expiresIn: "1d" }
    );

    res.cookie("accessToken", token, {
      httpOnly: true,
      secure: true, // ใช้ true ใน production บน HTTPS
      sameSite: "None",
      maxAge: 24 * 60 * 60 * 1000, // 1 วัน
    });

    return res.status(201).json({
      message: "ลงทะเบียนสำเร็จ",
    });
  } catch (error) {
    console.error("Error in register_user_auth:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
};

const login = async (req, res, role) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ message: "กรอกข้อมูลให้ครบถ้วน" });
  }

  try {
    const user = await User.findOne({ phone: phone, role: { $in: role } });
    if (!user) {
      return res.status(401).json({ message: "เบอร์โทรไม่ถูกต้อง" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "รหัสผ่านไม่ถูกต้อง" });
    }

    const token = JWT.sign(
      {
        _id: user._id,
        role: user.role,
        phone: user.phone,
      },
      process.env.TOKEN_SECRET,
      { expiresIn: "1d" }
    );

    res.cookie("accessToken", token, {
      httpOnly: true,
      secure: true, // ใช้ true ใน production บน HTTPS
      sameSite: "None",
      maxAge: 24 * 60 * 60 * 1000, // 1 วัน
    });

    res.status(200).json({
      message: "เข้าสู่ระบบสำเลัด",
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
      token: token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
};
const get_user = async (req, res) => {
  try {
    const { id } = req;
    const user = await User.findById(id);
    res.status(200).json({ data: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
};

///verify user
const verifyUserCreate = async (req, res, next) => {
  try {
    const { id } = req;
    const { verificationData, verificationStatus } = req.body;

    const idCardImageFile = req?.files?.idCardImage?.[0];
    const selfieImageFile = req?.files?.selfieImage?.[0];

    let upload = "";
    let uploadSelfImage = "";

    if (idCardImageFile) {
      upload = await uploadImage(idCardImageFile);
    }
    if (selfieImageFile) {
      uploadSelfImage = await uploadImage(selfieImageFile);
    }

    const data = new seller({
      user_id: id,
      idCardImage: upload,
      selfieImage: uploadSelfImage,
      verificationData,
      verificationStatus,
    });

    await data.save();

    res.status(200).json({ message: "ข้อมูลการยืนยันตัวตนถูกเรียบร้อยแล้ว" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

///get-verify-user
const getVerifyUser = async (req, res) => {
  try {
    const { id } = req;
    const sellerData = await seller.findOne({ user_id: id });
    // if (!sellerData) {
    //   return res.status(404).json({ message: "ไม่พบข้อมูลผู้ขาย" });
    // }s
    res.status(200).json({ data: sellerData });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
};

const updateSellerReject = async (req, res) => {
  try {
    // ✅ ดึงข้อมูลผู้ขายเดิม (ใช้ user_id ที่ส่งมา)
    const checkSellId = await seller.findOne({ user_id: req.id });
    if (!checkSellId) {
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ขาย" });
    }

    const idCardImageFile = req?.files?.idCardImage?.[0];
    const selfieImageFile = req?.files?.selfieImage?.[0];

    let idCardImage = checkSellId.idCardImage;
    let selfieImage = checkSellId.selfieImage;

    // === Handle ID Card Image ===
    if (typeof idCardImageFile === "string") {
      idCardImage = idCardImageFile;
    } else if (idCardImageFile && idCardImageFile.buffer) {
      if (checkSellId.idCardImage) {
        await deleteCloudinaryImage(checkSellId.idCardImage); // ✅ ลบจาก URL เดิม
      }
      idCardImage = await uploadImage(idCardImageFile);
    }

    // === Handle Selfie Image ===
    if (typeof selfieImageFile === "string") {
      selfieImage = selfieImageFile;
    } else if (selfieImageFile && selfieImageFile.buffer) {
      if (checkSellId.selfieImage) {
        await deleteCloudinaryImage(checkSellId.selfieImage);
      }
      selfieImage = await uploadImage(selfieImageFile); // ✅ ใช้ selfieImageFile
    }
    let verificationData = {};
    if (
      req.body.verificationData &&
      typeof req.body.verificationData === "string"
    ) {
      try {
        verificationData = JSON.parse(req.body.verificationData);
      } catch (err) {
        return res
          .status(400)
          .json({ message: "Invalid verificationData format" });
      }
    }
    // === Build update fields safely ===
    const updateFields = {
      verificationStatus: "pending",
      idCardImage,
      selfieImage,
      verificationData,
    };

    const sellerData = await seller.findOneAndUpdate(
      { user_id: req.id },
      updateFields,
      { new: true }
    );

    res.status(200).json({
      message: "อัปเดตข้อมูลผู้ขายเรียบร้อยแล้ว",
      seller: sellerData,
    });
  } catch (error) {
    console.error("updateSellerReject Error:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
};

const updateSeller = async (req, res) => {
  try {
    const { id } = req;

    const {
      store_name,
      address,
      description,
      store_code,
      bank_account_name,
      bank_account_number,
      bank_name,
      isSubmitted,
      bank_account_images: bankImageFromBody, // <-- มาจาก req.body เป็น string
      store_images,
    } = req.body;

    const existingSeller = await seller.findOne({ user_id: id });
    if (!existingSeller) {
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ขาย" });
    }

    // สร้าง store_code ถ้ายังไม่มี
    let finalStoreCode = store_code;
    if (!finalStoreCode) {
      const generateRandomCode = (length = 6) => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        return Array.from({ length }, () =>
          chars.charAt(Math.floor(Math.random() * chars.length))
        ).join("");
      };
      finalStoreCode = generateRandomCode();
    }

    // 👇 ดึงไฟล์ที่อาจถูกอัปโหลดใหม่
    const storeImageFile = req.files?.store_images?.[0];
    const bankImageFile = req.files?.bank_account_images?.[0];

    let finalStoreImage = existingSeller.store_images;
    let finalBankImage = existingSeller.bank_account_images;

    // ✅ อัปโหลด store image ใหม่ถ้ามี
    if (storeImageFile) {
      console.log("📦 Uploading new store image...");
      await deleteCloudinaryImage(existingSeller.store_images); // ลบรูปเก่า
      const uploaded = await uploadImage(storeImageFile); // อัปโหลดใหม่
      finalStoreImage = uploaded;
    }

    // ✅ อัปโหลด bank image ใหม่ หรือใช้ string URL เดิม
    if (bankImageFile) {
      console.log("📦 Uploading new bank image...");
      await deleteCloudinaryImage(existingSeller.bank_account_images); // ลบรูปเก่า
      const uploaded = await uploadImage(bankImageFile); // อัปโหลดใหม่
      finalBankImage = uploaded;
    } else if (typeof bankImageFromBody === "string") {
      finalBankImage = bankImageFromBody; // ใช้ URL จาก req.body
    } else if (typeof store_images === "string") {
      finalStoreImage = store_images;
    }

    // ✅ เตรียมข้อมูล
    const updateData = {
      store_name,
      address,
      description,
      store_code: finalStoreCode,
      bank_account_name,
      bank_account_number,
      bank_name,
      isSubmitted,
      store_images: finalStoreImage,
      bank_account_images: finalBankImage,
    };

    // ✅ อัปเดต
    const updatedSeller = await seller.findOneAndUpdate(
      { user_id: id },
      updateData,
      { new: true }
    );

    res.status(200).json({
      message: "อัปเดตข้อมูลร้านค้าเรียบร้อยแล้ว",
      data: updatedSeller,
    });
  } catch (error) {
    console.error("❌ Error in updateSeller:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
};
const update_access_seller = async (req, res) => {
  try {
    const { id } = req.params;
    const { verificationStatus } = req.body;

    const updated = await seller.findByIdAndUpdate(
      id,
      { verificationStatus },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "ไม่พบข้อมูล" });

    const userId = updated.user_id?.toString();
    // 🔍 ค้นหาข้อมูล push subscription ของ user คนนี้
    const subscriptionData = await SubscriptionModel.findOne({ userId });
    ////socket io
    const io = req.app.get("io");
    const userSocketMap = req.app.get("userSocketMap");

    const targetSocketId = userSocketMap.get(userId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("verify_result", {
        status: verificationStatus,
        message: `สถานะของคุณคือ: ${verificationStatus}`,
      });
    }
    if (subscriptionData) {
      const payload = JSON.stringify({
        title: "ผลการยืนยันตัวตน",
        body: `สถานะของคุณคือ: ${verificationStatus}`,
        url: "http://localhost:5173/setting",
      });
      await webpush.sendNotification(subscriptionData.subscription, payload);
    }
    res.json({ message: "อัปเดตสำเร็จ", data: updated });
  } catch (error) {
    console.error("update_access_seller error:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
};
// DELETE /api/notification/unsubscribe/:userId
const unsubscribe = async (req, res) => {
  try {
    const { id } = req.params;
    await SubscriptionModel.findOneAndDelete({ userId: id });
    res.status(200).json({ message: "ลบการแจ้งเตือนสำเร็จ" });
  } catch (error) {
    console.error("update_access_seller error:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
};

const remove_logout = async (req, res) => {
  try {
    res.clearCookie("accessToken", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    res.status(200).json({ message: "Logged out" });
  } catch (error) {
    console.error("update_access_seller error:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
};
const get_sellers = async (req, res) => {
  try {
    const sellersList = await sellers.find().lean();
    const allProducts = await products
      .find({ access_products: "access" })
      .lean();

    for (const seller of sellersList) {
      // หาสินค้าของ seller คนนี้
      const sellerProducts = allProducts.filter(
        (product) => product.user_id.toString() === seller.user_id.toString()
      );

      // จำนวนสินค้าทั้งหมด
      seller.productsCount = sellerProducts.length;

      // รวมยอดขายทั้งหมด (สมมติ field คือ sold)
      seller.totalSold = sellerProducts.reduce(
        (sum, product) => sum + (product.sold_count || 0),
        0
      );

      // แนบสินค้าไปด้วย (ถ้าอยากโชว์)
      seller.products = sellerProducts;
    }

    res.status(200).json({
      data: sellersList,
    });
  } catch (error) {
    console.error("get_sellers error:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
};
//get_seller :id
const get_seller = async (req, res) => {
  try {
    const { userId } = req.params;

    // ดึงข้อมูล seller
    const find_seller = await sellers
      .findOne({
        user_id: userId,
      })
      .lean();

    if (!find_seller) {
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ขาย" });
    }

    // ดึงสินค้าของ seller
    const find_products = await products.find({
      access_products: "access",
      user_id: userId,
    });

    // รวม object: seller + productsCount + products (products อยู่ท้ายสุด)
    const sellerWithProducts = {
      ...find_seller,
      productsCount: find_products.length,
      products: find_products,
    };

    res.status(200).json({
      data: sellerWithProducts,
    });
  } catch (error) {
    console.error("get_seller error:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
};

module.exports.register_user_auth = register_user_auth;
module.exports.login = login;
module.exports.get_user = get_user;
module.exports.verifyUserCreate = verifyUserCreate;
module.exports.getVerifyUser = getVerifyUser;
module.exports.updateSeller = updateSeller;
module.exports.updateSellerReject = updateSellerReject;
module.exports.update_access_seller = update_access_seller;
module.exports.unsubscribe = unsubscribe;
module.exports.remove_logout = remove_logout;
module.exports.get_seller = get_seller;
module.exports.get_sellers = get_sellers;
// const update_access_seller = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { verificationStatus } = req.body;

//     const updated = await seller.findByIdAndUpdate(id, { verificationStatus }, { new: true });
//     if (!updated) return res.status(404).json({ message: "ไม่พบข้อมูล" });

//     const userId = updated.user_id?.toString();

//     const io = req.app.get("io");
//     const userSocketMap = req.app.get("userSocketMap");

//     const targetSocketId = userSocketMap.get(userId);
//     if (targetSocketId) {
//       io.to(targetSocketId).emit("verify_result", {
//         status: verificationStatus,
//         message: `สถานะของคุณคือ: ${verificationStatus}`,
//       });
//     }

//     res.json({ message: "อัปเดตสำเร็จ", data: updated });
//   } catch (error) {
//     console.error("update_access_seller error:", error);
//     res.status(500).json({ message: "เกิดข้อผิดพลาด" });
//   }
// };
