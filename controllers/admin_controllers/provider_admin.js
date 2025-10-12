const cloudinary = require("../../config/clound_images");
const Category = require("../../models/category");
const Joi = require("joi");
const Coupon = require("../../models/coupons");
const Product = require("../../models/products");
const seller = require("../../models/sellers");
const SubscriptionModel = require("../../models/SubscriptionModel");
const webpush = require("web-push");
const User = require("../../models/user");
const Order = require("../../models/client_models/order");
const {
  refreshRedis_home,
  refreshRedisProducts,
} = require("../client_controllers/products");
const redis = require("../../config/redisClient");
const sellers = require("../../models/sellers");
const mongoose = require("mongoose");
// Joi Schema แยกไว้ด้านนอก
const categorySchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  description: Joi.string().trim().min(5).required(),
  image: Joi.string().uri().optional(), // หรือ Joi.string().optional() ถ้าเป็น base64
  status: Joi.string().valid(true, false).default(true),
});
// ✅ Validate และ sanitize input
const validateMongoId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid ID format");
  }
  return id;
};

// Image upload helper
const uploadImage = async (image) => {
  try {
    return await cloudinary.uploader.upload(image, {
      folder: "ecommerce/categories",
      resource_type: "image",
      transformation: [{ width: 500, height: 500, crop: "limit" }],
    });
  } catch (error) {
    console.error("❌ Cloudinary upload error:", error);
    throw new Error("Image upload failed");
  }
};

// Sanitize (กรอง tag html)
const sanitize = (str) =>
  typeof str === "string" ? str.trim().replace(/<[^>]*>?/gm, "") : str;

// Main controller ເພີ່ມໝວດໝູ່ສິນຄ້າ
const add_category = async (req, res) => {
  try {
    // ✅ Joi validation
    const { error, value } = categorySchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    const { id } = req;
    if (error) {
      return res.status(400).json({
        message: "Invalid input",
        details: error.details.map((err) => err.message),
      });
    }

    // ✅ Sanitize only what matters
    const name = sanitize(value.name);
    const description = sanitize(value.description);
    const status = sanitize(value.status);
    const image = value.image;

    const newCategory = {
      name,
      description,
      image: "default_image_url",
      status,
    };

    // ✅ Upload image if provided
    if (image) {
      try {
        const uploadedImage = await uploadImage(image);
        newCategory.image = uploadedImage.secure_url;
      } catch (uploadError) {
        return res.status(500).json({
          message: "Failed to upload image to Cloudinary.",
          error: uploadError.message,
        });
      }
    }

    // ✅ Save to MongoDB
    const savedCategory = new Category({
      user_id: id,
      name: newCategory.name,
      description: newCategory.description,
      images: newCategory.image,
      status: newCategory.status,
    });
    await savedCategory.save();

    return res.status(201).json({
      message: "Category added successfully",
      data: savedCategory,
    });
  } catch (error) {
    console.error("❌ Error adding category:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
//ດືງຂໍ້ມູນໝວດໝູ່
const get_category = async (req, res) => {
  try {
    const categories = await Category.find();
    if (!categories || categories.length === 0) {
      return res.status(404).json({ message: "No categories found" });
    }
    return res.status(200).json({
      message: "Categories retrieved successfully",
      data: categories,
    });
  } catch (error) {
    console.error("❌ Error retrieving categories:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
//ລົບຮູບພາບ
const delete_image = async (imageUrl) => {
  try {
    const publicId = imageUrl.split("/").pop().split(".")[0];
    console.log("Deleting image from Cloudinary:", publicId);
    await cloudinary.uploader.destroy(`ecommerce/categories/${publicId}`, {
      resource_type: "image",
    });
    console.log("Image deleted successfully from Cloudinary");
  } catch (error) {
    console.error("❌ Error deleting image from Cloudinary:", error);
    throw new Error("Image deletion failed");
  }
};
///ອັບເດດໝວດໝ
const update_category = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, image, status } = req.body;
    // Validate input
    if (!id || !name || !description) {
      return res.status(400).json({ message: "Invalid input" });
    }

    // Find category
    const category = {
      name: name,
      description: description,
      images: image,
      status: status,
    };
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Update fields
    category.name = name;
    category.description = description;

    if (image) {
      // ถ้ามีภาพใหม่เข้ามา
      if (
        category.images &&
        category.images !== "default_image_url" &&
        typeof image !== "string"
      ) {
        // ถ้ามีภาพเดิม และ image ใหม่ไม่ใช่ string → ลบภาพเดิมก่อน
        await delete_image(category.images);
      }

      // อัปโหลดภาพใหม่ถ้าไม่ใช่ string (คือเป็นไฟล์)
      if (typeof image !== "string") {
        const uploadedImage = await uploadImage(image);
        category.images = uploadedImage.secure_url;
      } else {
        // เป็น string เช่น URL หรือ base64 → ใช้ตามนั้น
        category.images = image;
      }
    }

    if (status) {
      category.status = status;
    }

    const data = await Category.findByIdAndUpdate(id, category, {
      new: true, // Return the updated document
      runValidators: true, // Ensure model validators are applied
    });
    await data.save();

    return res.status(200).json({
      message: "Category updated successfully",
      data: category,
    });
  } catch (error) {
    console.error("❌ Error updating category:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
//ລົບໝວດໝູ່
const delete_category = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate input
    if (!id) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    // Find category
    const category = await Category.findById(validateMongoId(req.params.id));
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Delete image from Cloudinary if exists
    if (category.images && category.images !== "default_image_url") {
      await delete_image(category.images);
    }

    // Delete category from MongoDB
    await Category.findByIdAndDelete(id);

    return res.status(200).json({
      message: "Category deleted successfully",
      data: category,
    });
  } catch (error) {
    console.error("❌ Error deleting category:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
//////provider coupon controller
const couponSchema = Joi.object({
  applicable_products: Joi.array().required(),
  applicable_stores: Joi.array().required(),
  applicable_type: Joi.string().required(),
  coupon_code: Joi.string().trim().min(2).max(50).required(),
  description: Joi.string().trim().min(2).required(),
  discount_type: Joi.string().valid("percentage", "fixed").required(),
  discount_value: Joi.number().min(0).required(),
  start_date: Joi.date().required(),
  end_date: Joi.date().min(Joi.ref("start_date")).required(),
  min_order_amount: Joi.number().min(0).default(0),
  max_discount_amount: Joi.number().min(0).default(0),
  usage_limit: Joi.number().min(0).default(0),
  used_count: Joi.number().min(0).default(0),
  status: Joi.string().valid("active", "inactive", "expired").default("active"),
});
///ເພີ່ມຄູປອງ
const add_coupon = async (req, res) => {
  try {
    const { error, value } = couponSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      return res.status(400).json({
        message: "Invalid coupon data",
        details: error.details.map((err) => err.message),
      });
    }

    // // ตรวจสอบว่ารหัสคูปองซ้ำหรือไม่
    const existing = await Coupon.findOne({ coupon_code: value.coupon_code });
    if (existing) {
      return res.status(409).json({ message: "Coupon code already exists" });
    }
    // // สร้างคูปองใหม่
    const coupon = new Coupon({
      user_id: req.id,
      coupon_code: value?.coupon_code,
      discount_type: value?.discount_type,
      discount_value: value?.discount_value,
      description: value.description,
      start_date: value?.start_date,
      end_date: value?.end_date,
      min_order_amount: value?.min_order_amount,
      max_discount_amount: value?.max_discount_amount,
      usage_limit: value?.usage_limit,
      used_count: value?.used_count,
      status: value?.status,
      applicable_stores: value?.applicable_stores,
      applicable_products: value?.applicable_products,
      applicable_type: value?.applicable_type,
      description: value?.description,
    });
    await coupon.save();

    return res.status(201).json({ message: "Coupon added successfully" });
  } catch (error) {
    console.error("❌ Error adding coupon:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
///ດືງຂໍ້ມູນສິນຄ້າມາທັງໝົດ
const get_products = async (req, res) => {
  try {
    const find_products = await Product.find().populate("user_id").populate({
      path: "categoryId",
      select: "name description", // เช่นเดียวกัน เลือกเฉพาะที่ต้องการ
    });

    res.status(200).json({
      data: find_products,
    });
  } catch (error) {
    console.error("❌ Error ", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
//ດືງຄູປອງມາທັງໝົດ
const get_coupon = async (req, res) => {
  try {
    const findCoupon = await Coupon.find();
    res.status(200).json({
      data: findCoupon,
    });
  } catch (error) {
    console.error("❌ Error ", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
///ອັບເດດຄູປອງ
const update_coupons = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate input using schema
    const { error, value } = couponSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    console.log(value);
    if (error) {
      return res.status(400).json({
        message: "Invalid coupon data",
        details: error.details.map((err) => err.message),
      });
    }

    // Update coupon
    const updateCoupon = await Coupon.findByIdAndUpdate(id, value, {
      new: true,
      runValidators: true,
    });

    if (!updateCoupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }
    console.log(updateCoupon);
    return res.status(200).json({
      message: "Coupon updated successfully",
      coupon: updateCoupon,
    });
  } catch (error) {
    console.error("❌ Error updating coupon:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
//ປະຕິເສດຢືນຢັນຜູ້ຂາຍ
const reject_seller = async (req, res) => {
  try {
    const { id } = req.params;
    const { verificationStatus, rejectionReason } = req.body;

    const find_sellers = await seller.findByIdAndUpdate(
      id,
      {
        verificationStatus,
        rejectionReason,
      },
      {
        new: true,
        runValidators: true,
      }
    );
    const userId = find_sellers.user_id?.toString();
    // 🔍 ค้นหาข้อมูล push subscription ของ user คนนี้
    const subscriptionData = await SubscriptionModel.findOne({
      userId: userId,
    });
    if (subscriptionData) {
      const payload = JSON.stringify({
        title: "ປະຕິເສດ",
        body: `ກະລຸນາຢືນຢັນຕົວຕົນໃໝ່: ${verificationStatus}`,
        url: "http://localhost:5173/setting",
      });
      await webpush.sendNotification(subscriptionData.subscription, payload);
    }
    return res.status(200).json({
      message: "rejected successfully",
      data: find_sellers,
    });
  } catch (error) {
    console.error("❌ Error updating coupon:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
//ອະນຸມັດສິນຄ້າໂດ່ດເດ່ນ
const toggleFeatured = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByIdAndUpdate(
      id,
      [{ $set: { is_featured: { $not: "$is_featured" } } }], // toggle
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    await redis.del(`product:${id}`); // ลบ cache เก่าออกก่อน
    const seller = await seller.findOne({ user_id: product.user_id });
    await redis.set(
      `product:${id}`,
      JSON.stringify({
        product: product,
        seller: seller,
      }),
      {
        ex: 3600,
        nx: true,
      }
    );
    await redis.del(`related_products:${id}`);
    await redis.set(`related_products:${id}`, JSON.stringify(product), {
      ex: 3600,
      nx: true,
    });
    await refreshRedis_home();
    await refreshRedisProducts();
    return res.status(200).json({
      message: "Product featured status toggled successfully",
      product,
    });
  } catch (error) {
    console.error("❌ Error toggling product featured status:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
// [{ ... }] → คือ aggregation pipeline update (ใช้ได้ตั้งแต่ MongoDB 4.2+)
// $set → ใช้สำหรับเซ็ตค่า field ใหม่
// is_featured → field ที่เราจะอัปเดต
// { $not: "$is_featured" } → จะกลับค่าของ is_featured
// ถ้า is_featured = true → จะได้ false
// ถ้า is_featured = false → จะได้ true
///handle Approve ສິນຄ້າ
//ອະນຸມັດຜູ້ຂາຍ ຢືນຢັນຕົວຕົນ
const approve_seller = async (req, res) => {
  try {
    const { id } = req.params;
    const find_seller = await Product.findByIdAndUpdate(
      id,
      {
        access_products: "access",
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!find_seller) {
      return res.status(404).json({ message: "Products not found" });
    }
    await redis.del(`product:${id}`); // ลบ cache เก่าออกก่อน
    const seller = await seller.findOne({ user_id: find_seller.user_id });
    await redis.set(
      `product:${id}`,
      JSON.stringify({
        product: find_seller,
        seller: seller,
      }),
      {
        ex: 3600,
        nx: true,
      }
    );
    await redis.del(`related_products:${id}`);
    await redis.set(`related_products:${id}`, JSON.stringify(find_seller), {
      ex: 3600,
      nx: true,
    });

    await refreshRedis_home();
    await refreshRedisProducts();
    return res.status(200).json({
      message: "Seller approved successfully",
      data: find_seller,
    });
  } catch (error) {
    console.error("❌ Error approving seller:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
//ອະນຸມັດສິນຄ້າ ແລະ ປະຕິເສດສິນຄ້າທີ່ສົ່ງຄ່າມາແບບ array ທີ່ແບບອະນຸມັດມາຫລາຍຕົວ
const bulk_approve_products = async (req, res) => {
  try {
    let idArray = [];
    const { status } = req.body; // 👈 รับ status จาก body
    // ✅ รับจาก params (เช่น /approve/id1,id2,id3)
    if (req.params.ids) {
      idArray = req.params.ids.split(",").map((id) => id.trim());
    }

    // ✅ รับจาก body (เช่น { "ids": ["id1", "id2"] })
    if (req.body.ids && Array.isArray(req.body.ids)) {
      idArray = req.body.ids;
    }

    // ❌ ไม่มี id ส่งมาเลย
    if (!idArray || idArray.length === 0) {
      return res.status(400).json({ message: "Product IDs are required" });
    }

    // ✅ อัปเดตสถานะ
    const updateResult = await Product.updateMany(
      { _id: { $in: idArray } },
      { $set: { access_products: status } },
      { runValidators: true }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(404).json({ message: "Products not found" });
    }

    // ✅ ดึงสินค้าที่อัปเดต
    const updatedProducts = await Product.find({ _id: { $in: idArray } });

    // ✅ อัปเดต cache Redis
    for (const product of updatedProducts) {
      await redis.del(`product:${product._id}`);
      const seller = await seller.findOne({ user_id: product.user_id });

      await redis.set(
        `product:${product._id}`,
        JSON.stringify({ product, seller }),
        {
          ex: 3600,
          nx: true,
        }
      );

      await redis.del(`related_products:${product._id}`);
      await redis.set(
        `related_products:${product._id}`,
        JSON.stringify(product),
        {
          ex: 3600,
          nx: true,
        }
      );
    }

    await refreshRedis_home();
    await refreshRedisProducts();

    return res.status(200).json({
      message: "Products approved successfully",
      count: updatedProducts.length,
      data: updatedProducts,
    });
  } catch (error) {
    console.error("❌ Error approving seller:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

////reject products ປະຕິເສດສິນຄ້າທີ່ບໍຜ່ານເກນ
const reject_seller_products = async (req, res) => {
  try {
    const { id } = req.params;
    const { sanitizedReason } = req.body;
    const find_seller = await Product.findByIdAndUpdate(
      id,
      {
        access_products: "rejected",
        sanitizedReason: sanitizedReason,
      },
      {
        new: true,
        runValidators: true,
      }
    );
    await find_seller.save();
    await redis.del(`product:${id}`); // ลบ cache เก่าออกก่อน
    const seller = await seller.findOne({ user_id: find_seller.user_id });
    await redis.set(
      `product:${id}`,
      JSON.stringify({
        product: find_seller,
        seller: seller,
      }),
      {
        ex: 3600,
        nx: true,
      }
    );
    await redis.del(`related_products:${id}`);
    await redis.set(`related_products:${id}`, JSON.stringify(find_seller), {
      ex: 3600,
      nx: true,
    });

    await refreshRedis_home();
    await refreshRedisProducts();
    return res.status(200).json({
      message: "ປະຕິດເສດສິນຄ້າ ຂໍ້ມູນບໍ່ຄົບຖ້ວນ",
    });
  } catch (error) {
    console.error("❌ Error approving seller:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
//ຈັດການຄ່າທຳນຽມລະບົບ
const update_seller_fee = async (req, res) => {
  try {
    const { id } = req.params;
    const { fee_system, vat } = req.body;
    const find_seller = await seller.findByIdAndUpdate(
      id,
      {
        fee_system: fee_system,
        vat: vat,
      },
      {
        new: true,
        runValidators: true,
      }
    );
    if (!find_seller) {
      return res.status(404).json({ message: "Seller not found" });
    }
    return res.status(200).json({
      message: "Seller fee updated successfully",
      data: find_seller,
    });
  } catch (error) {
    console.error("❌ Error approving seller:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
///ແກ້ໄຂໂປຣ user model
const edit_update_user = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, phone, email } = req.body;

    // ✅ อัปเดต user
    const user = await User.findByIdAndUpdate(
      id,
      { username, phone, email },
      { new: true, runValidators: true } // new: true => คืนค่าที่อัปเดตแล้ว
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "ອັບເດດສຳເລັດ",
      user,
    });
  } catch (error) {
    console.error("❌ edit_update_user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
///ດືງຂໍ້ມູນອໍເດີມາທັງໝົດ
const get_order_for_admin = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("user_id")
      .populate("items.productId");

    // ดึง user_id ของ product จากทุก order
    const userIds = orders
      .flatMap((order) =>
        order?.items?.map((i) => i.productId?.user_id?.toString())
      )
      .filter(Boolean);

    // หา seller ที่ user_id ตรงกับ product
    const sellers = await seller
      .find({
        user_id: { $in: userIds },
      })
      .select("store_name store_images store_code address fee_system user_id");

    // แปลงเป็น map (key = user_id)
    const sellerMap = sellers.reduce((acc, s) => {
      acc[s.user_id.toString()] = s;
      return acc;
    }, {});

    // ผูก seller เข้าไปในแต่ละ order
    const ordersWithSeller = orders.map((order) => {
      const relatedSellers = order.items
        .map((i) => sellerMap[i.productId?.user_id?.toString()])
        .filter(Boolean);

      return {
        ...order.toObject(),
        sellers: relatedSellers, // ✅ seller ที่เกี่ยวข้องกับ order นี้
      };
    });

    return res.status(200).json({
      message: "loading success",
      data: ordersWithSeller,
    });
  } catch (error) {
    console.error("❌ get_order_for_admin:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
//ດືງລາຍງານ
const report_admin = async (req, res) => {
  try {
    const { dateFilter, startDate, endDate } = req.query;

    // ===== Helper Function: คำนวณช่วงเวลา =====
    const getDateRange = () => {
      const now = new Date();
      let start = new Date();

      if (startDate && endDate) {
        return {
          start: new Date(startDate),
          end: new Date(endDate),
        };
      }

      switch (dateFilter) {
        case "today":
          start.setHours(0, 0, 0, 0);
          return { start, end: now };

        case "3days":
          start.setDate(now.getDate() - 3);
          return { start, end: now };

        case "7days":
          start.setDate(now.getDate() - 7);
          return { start, end: now };

        case "1month":
          start.setMonth(now.getMonth() - 1);
          return { start, end: now };

        case "1year":
          start.setFullYear(now.getFullYear() - 1);
          return { start, end: now };

        default:
          return { start: new Date(0), end: now };
      }
    };

    const { start: filterStart, end: filterEnd } = getDateRange();

    // ===== คำนวณช่วงเวลาเดือนก่อน (สำหรับเปรียบเทียบ) =====
    const getPreviousMonthRange = () => {
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const previousMonthStart = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1
      );
      const previousMonthEnd = new Date(
        now.getFullYear(),
        now.getMonth(),
        0,
        23,
        59,
        59
      );

      return {
        currentStart: currentMonthStart,
        currentEnd: now,
        previousStart: previousMonthStart,
        previousEnd: previousMonthEnd,
      };
    };

    const {
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
    } = getPreviousMonthRange();

    // ===== Helper Function: คำนวณ % การเปลี่ยนแปลง =====
    const calculatePercentageChange = (current, previous) => {
      if (previous === 0) {
        return current > 0 ? 100 : 0;
      }
      return ((current - previous) / previous) * 100;
    };

    // ----- ORDERS (Current Period) -----
    const ordersQuery = {
      createdAt: { $gte: filterStart, $lte: filterEnd },
    };

    const orders = await Order.find(ordersQuery);

    // ----- ORDERS (Current Month vs Previous Month) -----
    const currentMonthOrders = await Order.find({
      createdAt: { $gte: currentStart, $lte: currentEnd },
    });

    const previousMonthOrders = await Order.find({
      createdAt: { $gte: previousStart, $lte: previousEnd },
    });

    // คำนวณสถิติเดือนปัจจุบัน
    const currentStats = {
      totalOrders: currentMonthOrders.length,
      completedOrders: currentMonthOrders.filter(
        (o) => o.status === "PAYMENT_COMPLETED"
      ).length,
      pendingOrders: currentMonthOrders.filter((o) => o.status === "pending")
        .length,
      expiredOrders: currentMonthOrders.filter(
        (o) => o.status === "Cancelled" || o.status === "expired"
      ).length,
      totalSales: currentMonthOrders
        .filter((o) => o.status === "PAYMENT_COMPLETED")
        .reduce((sum, o) => sum + o.total, 0),
    };

    // คำนวณสถิติเดือนก่อน
    const previousStats = {
      totalOrders: previousMonthOrders.length,
      completedOrders: previousMonthOrders.filter(
        (o) => o.status === "PAYMENT_COMPLETED"
      ).length,
      pendingOrders: previousMonthOrders.filter((o) => o.status === "pending")
        .length,
      expiredOrders: previousMonthOrders.filter(
        (o) => o.status === "Cancelled" || o.status === "expired"
      ).length,
      totalSales: previousMonthOrders
        .filter((o) => o.status === "PAYMENT_COMPLETED")
        .reduce((sum, o) => sum + o.total, 0),
    };

    // คำนวณ % การเปลี่ยนแปลง
    const orderChanges = {
      totalOrders: calculatePercentageChange(
        currentStats.totalOrders,
        previousStats.totalOrders
      ),
      completedOrders: calculatePercentageChange(
        currentStats.completedOrders,
        previousStats.completedOrders
      ),
      pendingOrders: calculatePercentageChange(
        currentStats.pendingOrders,
        previousStats.pendingOrders
      ),
      expiredOrders: calculatePercentageChange(
        currentStats.expiredOrders,
        previousStats.expiredOrders
      ),
      totalSales: calculatePercentageChange(
        currentStats.totalSales,
        previousStats.totalSales
      ),
    };

    // ----- USERS (Current Month vs Previous Month) -----
    const currentMonthUsers = await User.find({
      createdAt: { $gte: currentStart, $lte: currentEnd },
    });

    const previousMonthUsers = await User.find({
      createdAt: { $gte: previousStart, $lte: previousEnd },
    });

    const currentUserStats = {
      totalUsersBuyer: currentMonthUsers.filter((u) => u.role === "client")
        .length,
      totalUsersSeller: currentMonthUsers.filter((u) => u.role === "sellers")
        .length,
      inactiveUsers: currentMonthUsers.filter((u) => u?.active == true).length,
    };

    const previousUserStats = {
      totalUsersBuyer: previousMonthUsers.filter((u) => u.role === "client")
        .length,
      totalUsersSeller: previousMonthUsers.filter((u) => u.role === "sellers")
        .length,
      inactiveUsers: previousMonthUsers.filter((u) => u?.active == true).length,
    };

    const userChanges = {
      totalUsersBuyer: calculatePercentageChange(
        currentUserStats.totalUsersBuyer,
        previousUserStats.totalUsersBuyer
      ),
      totalUsersSeller: calculatePercentageChange(
        currentUserStats.totalUsersSeller,
        previousUserStats.totalUsersSeller
      ),
      inactiveUsers: calculatePercentageChange(
        currentUserStats.inactiveUsers,
        previousUserStats.inactiveUsers
      ),
    };

    // ----- SELLERS (Current Month vs Previous Month) -----
    const currentMonthSellers = await seller.find({
      createdAt: { $gte: currentStart, $lte: currentEnd },
    });

    const previousMonthSellers = await seller.find({
      createdAt: { $gte: previousStart, $lte: previousEnd },
    });

    const currentSellerStats = {
      activeSellers: currentMonthSellers.filter(
        (s) => s.verificationStatus === "access"
      ).length,
      pendingSellers: currentMonthSellers.filter(
        (s) => s.verificationStatus === "pending"
      ).length,
      rejectedSellers: currentMonthSellers.filter(
        (s) => s.verificationStatus === "rejected"
      ).length,
    };

    const previousSellerStats = {
      activeSellers: previousMonthSellers.filter(
        (s) => s.verificationStatus === "access"
      ).length,
      pendingSellers: previousMonthSellers.filter(
        (s) => s.verificationStatus === "pending"
      ).length,
      rejectedSellers: previousMonthSellers.filter(
        (s) => s.verificationStatus === "rejected"
      ).length,
    };

    const sellerChanges = {
      activeSellers: calculatePercentageChange(
        currentSellerStats.activeSellers,
        previousSellerStats.activeSellers
      ),
      pendingSellers: calculatePercentageChange(
        currentSellerStats.pendingSellers,
        previousSellerStats.pendingSellers
      ),
      rejectedSellers: calculatePercentageChange(
        currentSellerStats.rejectedSellers,
        previousSellerStats.rejectedSellers
      ),
    };

    // ----- PRODUCTS (Current Month vs Previous Month) -----
    const currentMonthProducts = await Product.find({
      createdAt: { $gte: currentStart, $lte: currentEnd },
    });

    const previousMonthProducts = await Product.find({
      createdAt: { $gte: previousStart, $lte: previousEnd },
    });

    const productChanges = {
      totalProducts: calculatePercentageChange(
        currentMonthProducts.length,
        previousMonthProducts.length
      ),
    };

    // ----- SHIPPING (Current Month vs Previous Month) -----
    const currentShippingStats = {
      shippingOrders: currentMonthOrders.filter(
        (o) => o.shipping_status === "Shipped"
      ).length,
      pendingShipping: currentMonthOrders.filter(
        (o) => o.shipping_status === "pending"
      ).length,
      deliveredOrders: currentMonthOrders.filter(
        (o) => o.shipping_status === "Delivered"
      ).length,
      returnedOrders: currentMonthOrders.filter(
        (o) => o.shipping_status === "Cancelled"
      ).length,
    };

    const previousShippingStats = {
      shippingOrders: previousMonthOrders.filter(
        (o) => o.shipping_status === "Shipped"
      ).length,
      pendingShipping: previousMonthOrders.filter(
        (o) => o.shipping_status === "pending"
      ).length,
      deliveredOrders: previousMonthOrders.filter(
        (o) => o.shipping_status === "Delivered"
      ).length,
      returnedOrders: previousMonthOrders.filter(
        (o) => o.shipping_status === "Cancelled"
      ).length,
    };

    const shippingChanges = {
      shippingOrders: calculatePercentageChange(
        currentShippingStats.shippingOrders,
        previousShippingStats.shippingOrders
      ),
      pendingShipping: calculatePercentageChange(
        currentShippingStats.pendingShipping,
        previousShippingStats.pendingShipping
      ),
      deliveredOrders: calculatePercentageChange(
        currentShippingStats.deliveredOrders,
        previousShippingStats.deliveredOrders
      ),
      returnedOrders: calculatePercentageChange(
        currentShippingStats.returnedOrders,
        previousShippingStats.returnedOrders
      ),
    };

    // ===== ดึงข้อมูลอื่นๆ (ไม่เปลี่ยนแปลง) =====
    const latestOrder = await Order.find()
      .populate("user_id")
      .sort({ createdAt: -1 })
      .limit(10);
    // นับจำนวนออเดอร์ทั้งหมด (ไม่นับที่ถูกยกเลิก)
    const totalOrders =
      orders?.filter((i) => i.shipping_status !== "Cancelled").length || 0;
    // นับจำนวนออเดอร์ที่สำเร็จจริง
    const completedOrders =
      orders?.filter(
        (i) =>
          i.status === "PAYMENT_COMPLETED" && i.shipping_status === "Delivered" // สำเร็จเมื่อส่งถึงมือ
      ).length || 0;
    const pendingOrders = orders.filter((o) => o.status === "pending").length;
    const expiredOrders = orders.filter(
      (o) => o.status === "Cancelled" || o.status === "expired"
    ).length;

    const totalSales = orders
      .filter((o) => o.status === "PAYMENT_COMPLETED")
      .reduce((sum, o) => sum + o.total, 0);
    // รายได้รวมจากค่าธรรมเนียม (ทุกออเดอร์)
    const fee_system_total = orders?.reduce(
      (sum, i) => sum + (i.fee_system || 0),
      0
    );

    // รายได้สุทธิ (เฉพาะออเดอร์ที่ชำระแล้วและไม่ถูกยกเลิก)
    const fee_system_total_lastNet = orders
      ?.filter(
        (i) =>
          i.status === "PAYMENT_COMPLETED" && i.shipping_status !== "Cancelled" // ต้องเป็นออเดอร์ที่จ่ายแล้ว // และไม่ถูกยกเลิก
      )
      .reduce((sum, i) => sum + (i.fee_system || 0), 0);

    const total_summary = totalSales - fee_system_total;
    const pending_payout = orders
      .filter((o) => o.status === "PAYMENT_COMPLETED")
      .reduce((sum, o) => sum + o.total, 0);

    const users = await User.find();
    const totalUsersBuyer = users.filter((i) => i.role == "client").length;
    const totalUsersSeller = users.filter((i) => i.role == "sellers").length;
    const inactiveUsers = users.filter((u) => u.active === true).length;

    const newUsersThisMonth = users.filter((u) => {
      const createdAt = new Date(u.createdAt);
      return createdAt >= currentStart && createdAt <= currentEnd;
    });

    const newSellersThisMonth = newUsersThisMonth.filter(
      (u) => u.role === "sellers"
    ).length;
    const newClientThisMonth = newUsersThisMonth.filter(
      (u) => u.role === "client"
    ).length;

    const sellers = await seller.find();
    const activeSellers = sellers.filter(
      (s) => s.verificationStatus === "access"
    ).length;
    const pendingSellers = sellers.filter(
      (s) => s.verificationStatus === "pending"
    ).length;
    const rejectedSellers = sellers.filter(
      (s) => s.verificationStatus === "rejected"
    ).length;

    const topSeller = await seller.findOne().sort({ totalSales: -1 });
    const lowStockSellers = await Product.find({ stock: { $lte: 5 } }).distinct(
      "user_id"
    );

    const products = await Product.find();
    const totalProducts = products.length;

    const topSellingProducts = await Product.find()
      .populate("categoryId")
      .sort({ sold_count: -1 })
      .limit(5);

    const accessProducts = products.filter((p) => p.access === "access").length;
    const rejectedProducts = products.filter((p) => p.access === "rejected")
      .length;
    const processProducts = products.filter((p) => p.access === "process")
      .length;
    const lowStockProducts = products.filter((p) => p.stock <= 5).length;

    const shippingOrders = orders.filter(
      (o) => o.shipping_status === "Shipped"
    );
    const pendingShipping = orders.filter(
      (o) => o.shipping_status === "pending"
    );
    const deliveredOrders = orders.filter(
      (o) => o.shipping_status === "Delivered"
    );
    const returnedOrders = orders.filter(
      (o) => o.shipping_status === "Cancelled"
    );

    const abnormalOrders = orders.filter(
      (o) => o.abnormal === true || o.status === "Cancelled"
    );
    const sellerVerificationPending = sellers.filter(
      (s) => s.status === "pending"
    );
    const sellerVerificationRejected = sellers.filter(
      (s) => s.status === "rejected"
    );
    const lowStockAlerts = products.filter((p) => p.stock <= 5);
    const total_lastNet = orders
      ?.filter(
        (i) =>
          i.status === "PAYMENT_COMPLETED" && i.shipping_status !== "Cancelled" // ต้องเป็นออเดอร์ที่จ่ายแล้ว // และไม่ถูกยกเลิก
      )
      .reduce((sum, i) => sum + (i.total || 0), 0);
    // Sales Overview
    const salesOverview = {
      totalRevenue: totalSales,
      totalOrders: totalOrders,
      averageOrderValue: totalOrders > 0 ? totalSales / totalOrders : 0,
      completionRate:
        totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0,
      systemFee: fee_system_total,
      netRevenue: total_summary,
      pendingPayout: pending_payout,
      total_lastNet: total_lastNet,
    };

    // Daily Sales Data
    const getDailyData = () => {
      const dailyMap = new Map();

      orders.forEach((order) => {
        const dateKey = new Date(order.createdAt).toISOString().split("T")[0];

        if (!dailyMap.has(dateKey)) {
          dailyMap.set(dateKey, {
            date: dateKey,
            totalOrders: 0,
            completedOrders: 0,
            pendingOrders: 0,
            cancelledOrders: 0,
            totalSales: 0,
            totalItems: 0,
          });
        }

        const dayData = dailyMap.get(dateKey);
        dayData.totalOrders++;

        if (order.status === "PAYMENT_COMPLETED") {
          dayData.completedOrders++;
          dayData.totalSales += order.total || 0;
        } else if (order.status === "pending") {
          dayData.pendingOrders++;
        } else if (order.status === "Cancelled" || order.status === "expired") {
          dayData.cancelledOrders++;
        }

        dayData.totalItems += order.items?.length || 0;
      });

      return Array.from(dailyMap.values()).sort(
        (a, b) => new Date(a.date) - new Date(b.date)
      );
    };

    const dailySalesData = getDailyData();

    const revenueByCategory = await Order.aggregate([
      {
        $match: {
          status: "PAYMENT_COMPLETED",
          createdAt: { $gte: filterStart, $lte: filterEnd },
        },
      },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products_models",
          localField: "items.productId",
          foreignField: "_id",
          as: "productInfo",
        },
      },
      { $unwind: "$productInfo" },
      {
        $lookup: {
          from: "category_models",
          localField: "productInfo.categoryId",
          foreignField: "_id",
          as: "categoryInfo",
        },
      },
      { $unwind: "$categoryInfo" },
      {
        $group: {
          _id: "$categoryInfo._id",
          categoryName: { $first: "$categoryInfo.name" },
          totalRevenue: {
            $sum: { $multiply: ["$items.price", "$items.quantity"] },
          },
          totalQuantity: { $sum: "$items.quantity" },
        },
      },
      { $sort: { totalRevenue: -1 } },
    ]);

    // ===== RESPONSE WITH CHANGES =====
    const data = {
      filterInfo: {
        dateFilter: dateFilter || "all",
        startDate: filterStart,
        endDate: filterEnd,
      },
      salesOverview,
      dailySalesData,
      orders: {
        totalOrders,
        completedOrders,
        pendingOrders,
        expiredOrders,
        totalSales,
        fee_system_total,
        fee_system_total_lastNet,
        total_summary,
        pending_payout,
        latestOrder: latestOrder,
      },
      // ✅ เพิ่ม changes สำหรับแต่ละส่วน
      changes: {
        orders: orderChanges,
        users: userChanges,
        sellers: sellerChanges,
        products: productChanges,
        shipping: shippingChanges,
      },
      users: {
        totalUsersBuyer,
        totalUsersSeller,
        inactiveUsers,
        newUsersThisMonth: newUsersThisMonth.length,
        newClientThisMonth,
        newSellersThisMonth,
      },
      sellers: {
        activeSellers,
        pendingSellers,
        rejectedSellers,
        topSeller,
        lowStockSellers,
      },
      products: {
        totalProducts,
        topSellingProducts,
        accessProducts,
        rejectedProducts,
        processProducts,
        lowStockProducts,
      },
      shipping: {
        shippingOrders: shippingOrders.length,
        pendingShipping: pendingShipping.length,
        deliveredOrders: deliveredOrders.length,
        returnedOrders: returnedOrders.length,
      },
      notifications: {
        abnormalOrders: abnormalOrders.length,
        sellerVerificationPending: sellerVerificationPending.length,
        sellerVerificationRejected: sellerVerificationRejected.length,
        lowStockAlerts: lowStockAlerts.length,
      },
      revenueByCategory: revenueByCategory,
    };

    return res.status(200).json({
      message: "Report loaded successfully",
      data,
    });
  } catch (error) {
    console.error("❌ report_admin:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
module.exports = {
  add_category,
  get_category,
  update_category,
  delete_category,
  get_products,
  add_coupon,
  update_coupons,
  get_coupon,
  reject_seller,
  toggleFeatured,
  approve_seller,
  reject_seller_products,
  update_seller_fee,
  edit_update_user,
  bulk_approve_products,
  get_order_for_admin,
  report_admin,
};
