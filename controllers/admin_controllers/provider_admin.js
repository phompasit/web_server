const cloudinary = require("../../config/clound_images");
const Category = require("../../models/category");
const Joi = require("joi");
const Coupon = require("../../models/coupons");
const Product = require("../../models/products");
const seller = require("../../models/sellers");
const SubscriptionModel = require("../../models/SubscriptionModel");
const webpush = require("web-push");
// Joi Schema แยกไว้ด้านนอก
const categorySchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  description: Joi.string().trim().min(5).required(),
  image: Joi.string().uri().optional(), // หรือ Joi.string().optional() ถ้าเป็น base64
  status: Joi.string().valid(true, false).default(true),
});

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

// Main controller
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
      image: image,
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

const delete_category = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate input
    if (!id) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    // Find category
    const category = await Category.findById(id);
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
///handle Approve
const approve_seller = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(id);
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

    return res.status(200).json({
      message: "Seller approved successfully",
      data: find_seller,
    });
  } catch (error) {
    console.error("❌ Error approving seller:", error);
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
};
