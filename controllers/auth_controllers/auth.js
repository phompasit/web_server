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
const Joi = require("joi");
const loginSchema = Joi.object({
  phone: Joi.string().pattern(/^\d+$/).required(),
  password: Joi.string().min(6).required(),
});
const mongoose = require("mongoose");
// validation schema
const registerSchema = Joi.object({
  username: Joi.string().min(3).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.string()
    .pattern(/^\d{7,15}$/)
    .optional()
    .allow(null, ""),
  agreeTerms: Joi.boolean().optional(),
  role: Joi.string().min(10).required(),
});
// Image upload helper
const uploadImage = async (image) => {
  try {
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
    // Validate and strip unknown fields (this will remove {$ne:...} objects etc)
    const { value, error } = registerSchema.validate(req.body, {
      stripUnknown: true,
    });
    if (error) {
      return res.status(400).json({
        message: "ຂໍ້ມູນບໍ່ຖືກຕ້ອງ",
        details: error.details.map((d) => d.message),
      });
    }

    // Cast to safe primitives
    const username = String(value.username).trim();
    const email = String(value.email).trim().toLowerCase();
    const password = String(value.password);
    const phone = value.phone ? String(value.phone).trim() : null;
    const agreeTerms = Boolean(value.agreeTerms);

    // Prevent role escalation: server decides role (ignore any role from client)
    const role = value.role;

    // Check duplicates (safe queries using primitives)
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: " ຊື່ຜູ້ໃຊ້ຫຼືອິເມວມີຜູ້ໃຊ້ງານແລ້ວ" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      phone,
      agreeTerms,
      role,
    });

    await newUser.save();

    // Sign token (if you want cookie-based session)
    const token = JWT.sign(
      { _id: newUser._id.toString(), role: newUser.role },
      process.env.TOKEN_SECRET,
      { expiresIn: "1d" }
    );

    const isProd = process.env.NODE_ENV === "production";
    res.cookie("accessToken", token, {
      httpOnly: true,
      secure: isProd, // true only in production on HTTPS
      sameSite: "Lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({ message: "ລົງທະບຽນສຳເລັດ" });
  } catch (error) {
    console.error("Error in register_user_auth:", error);
    return res.status(500).json({ message: "server error" });
  }
};
const login = async (req, res, role = []) => {
  // validate input ให้แยก error กับ value
  const { value, error } = loginSchema.validate(req.body, {
    stripUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      message: "ຂໍ້ມູນບໍ່ຖືກຕ້ອງ",
      details: error.details.map((d) => d.message),
    });
  }

  // cast ค่าให้แน่นอน (value.phone เป็น string ตาม Joi)
  const phone = String(value.phone);
  const password = String(value.password);

  try {
    // หา user โดยใช้ค่า primitive เท่านั้น (ไม่ใช้ user-supplied object)
    const user = await User.findOne({
      phone: phone,
      role: { $in: Array.isArray(role) ? role : [role] },
    }).select("+password");
    // .select('+password') ในกรณีที่ password ถูก exclude ใน schema; ปรับตาม model ของคุณ

    if (!user) {
      // ไม่ระบุรายละเอียดมากเกินไป (avoid user enumeration)
      return res.status(401).json({ message: "ເບີໂທລະສັບບໍ່ຖືກຕ້ອງ" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ" });
    }

    const token = JWT.sign(
      {
        _id: user._id.toString(),
        role: user.role,
        phone: user.phone,
      },
      process.env.TOKEN_SECRET,
      { expiresIn: "1d" }
    );

    // ตั้ง cookie เฉพาะ production ให้ secure = true
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("accessToken", token, {
      httpOnly: true,
      secure: isProd, // true เฉพาะบน HTTPS
      sameSite: isProd ? "Lax" : "Lax", // ปรับเป็น 'Lax' ปกติปลอดภัยกว่า 'None'
      maxAge: 24 * 60 * 60 * 1000, // 1 วัน
      // domain, path, signed สามารถกำหนดได้ตามต้องการ
    });

    // คืนข้อมูลผู้ใช้โดยไม่รวม password
    res.status(200).json({
      message: "ເຂົ້າສູ່ລະບົບສຳເລັດ",
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
      // ถ้าคุณต้องการให้ client เก็บ token (เช่น mobile app) อาจส่ง token ด้วย
      token: token,
    });
  } catch (err) {
    console.error("login error:", err);
    // internal error — อย่า leak ข้อมูลงานภายใน
    res.status(500).json({ message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
};
const get_user = async (req, res) => {
  try {
    const { id } = req;
    if (!id) return res.status(400).json({ message: "ต้องระบุ id ผู้ใช้" });
    // ตรวจรูปแบบ ObjectId ก่อน query
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "id ไม่ถูกต้อง" });
    }
    const user = await User.findById(id).select("-password -__v");
    if (!user) return res.status(404).json({ message: "ไม่พบผู้ใช้" });
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
    // 📝 parse JSON field กลับมาเป็น object
    const parsedData = verificationData ? JSON.parse(verificationData) : {};
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
      verificationData: parsedData,
      verificationStatus,
    });

    await data.save();

    res.status(200).json({ message: "ຂໍ້ມູນການຢືນຢັນຕົວຕົນສົ່ງສຳເລັດ" });
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
      return res.status(404).json({ message: "ບໍ່ພົບຂໍ້ມູນຂາຍ" });
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
      message: "ອັບເດດຂໍ້ມູນຜູ້ຂາຍສຳເລັດ",
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
      return res.status(404).json({ message: "ບໍ່ພົບຂໍ້ມູນຜູ້ຂາຍ ກະລຸນາຢືນຢັນຕົວຕົນໃຫ້ສຳເລັດ" });
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
      message: "ອັບເດດຂໍ້ມູນຮ້ານຄ້າສຳເລັດ",
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
    const subscriptionData = await SubscriptionModel.findOne({
      userId: userId,
    });
    if (subscriptionData) {
      const payload = JSON.stringify({
        title: "ຜົນການຍືນຢັນຕົວຕົນ",
        body: `ສະຖານະຄື: ${verificationStatus}`,
        url: "http://localhost:5173/setting",
      });
      await webpush.sendNotification(subscriptionData.subscription, payload);
    }
    res.json({ message: "ອັບເດດສຳເລັດ", data: updated });
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
    res.status(200).json({ message: "ລົບການແຈ້ງເຕືອນສຳເລັດ" });
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
    res.status(200).json({ message: "ອອກລະບົບສຳເລັດ" });
  } catch (error) {
    console.error("update_access_seller error:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
};
const get_sellers = async (req, res) => {
  try {
    const sellersList = await sellers
      .find()
      .lean()
      .select(
        "_id user_id store_code store_images  store_name totalSold  verificationStatus description address createdAt"
      );
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
const statusActive_seller = async (req, res) => {
  try {
    const { userId } = req.params;
    console.log("userId", userId);
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { active: !user.active },
      { new: true } // คืนค่า user ที่อัปเดตแล้ว
    );

    res.status(200).json({
      message: "Update block seller success",
      active: updatedUser.active, // ส่งสถานะใหม่กลับไปด้วย
    });
  } catch (error) {
    console.error("statusActive_seller error:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
};
const deleteAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const userId = req.id;
    if (!userId || !addressId) {
      return res.status(400).json({ message: "userId และ addressId จำเป็น" });
    }

    // validate id format ก่อน (กัน undefined)
    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(addressId)
    ) {
      return res.status(400).json({ message: "รูปแบบ ObjectId ไม่ถูกต้อง" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $pull: { shipping: { _id: addressId } } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "ไม่พบผู้ใช้" });
    }

    res.status(200).json({
      message: "ລົບທີ່ຢູ່ສຳເລັດ",
      user: updatedUser,
    });
  } catch (error) {
    console.error("❌ deleteAddress error:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
};

module.exports.register_user_auth = register_user_auth; //ສະໝັກສະມາຊິກ
module.exports.login = login; /// ລອກອິນ
module.exports.get_user = get_user;  ///ດືງ user ມາທັງໝົດ
module.exports.verifyUserCreate = verifyUserCreate; ///ສຳລັບຢືນຢັນຕົວຕົນຜູ້ຂາຍ
module.exports.getVerifyUser = getVerifyUser; ///ດືງຂໍ້ມູນຜູ້ຂາຍ
module.exports.updateSeller = updateSeller; //ອັບເດດຂໍ້ມູນຜູ້ຂາຍ
module.exports.updateSellerReject = updateSellerReject; //ປະຕິເສດຂໍ້ມູນຜູ້ຂາຍ
module.exports.update_access_seller = update_access_seller; //ອະນຸມັດຜູ້ຂາຍ
module.exports.unsubscribe = unsubscribe; ///ຍົກເລີກເປີດການແຈ້ງເຕືອນ
module.exports.remove_logout = remove_logout; ///ອອກລະບົບ
module.exports.get_seller = get_seller; //ດືງຂໍ້ມູນຜູ້ຂາຍ
module.exports.get_sellers = get_sellers;
module.exports.statusActive_seller = statusActive_seller;
module.exports.deleteAddress = deleteAddress;
