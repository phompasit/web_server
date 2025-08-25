const Joi = require("joi");
const mongoose = require("mongoose");
const Product = require("../../models/products");
const cloudinary = require("../../config/clound_images"); // Assuming you have a cloudinary config file
// Image upload helper
const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const uploadImages = async (images) => {
  try {
    if (!Array.isArray(images)) {
      throw new Error("Images must be an array");
    }

    const uploadedImages = await Promise.all(
      images.map((image) => {
        // ✅ ตรวจสอบ mimetype และขนาด
        if (!ALLOWED_FILE_TYPES.includes(image.mimetype)) {
          throw new Error(`ประเภทไฟล์ไม่ถูกต้อง: ${image.mimetype}`);
        }

        if (image.size > MAX_FILE_SIZE) {
          throw new Error(`ขนาดไฟล์เกิน ${MAX_FILE_SIZE / 1024 / 1024}MB`);
        }

        // ✅ ใช้ Promise เพื่อ stream buffer ไป Cloudinary
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: "ecommerce/products",
              resource_type: "image",
              transformation: [{ width: 500, height: 500, crop: "limit" }],
            },
            (error, result) => {
              if (error) return reject(error);
              resolve(result.secure_url);
            }
          );

          // ❗️ส่งเฉพาะ image.buffer
          stream.end(image.buffer);
        });
      })
    );

    return uploadedImages; // array ของ secure_url
  } catch (error) {
    console.error("❌ Cloudinary upload error:", error.message);
    throw new Error("Image upload failed");
  }
};
const delete_image = async (imageUrl) => {
  try {
    if (typeof imageUrl !== "string") {
      throw new Error("Invalid imageUrl: must be a string");
    }

    // ใช้ regex เพื่อแยก path ที่ตามหลัง "upload/"
    const match = imageUrl.match(
      /upload\/(?:v\d+\/)?(.+)\.(jpg|jpeg|png|webp)$/
    );
    if (!match || !match[1]) {
      throw new Error("Invalid Cloudinary URL format");
    }

    const publicId = match[1]; // เช่น ecommerce/products/ni1hyavztpcfxowu8xhm

    console.log("🗑️ Deleting image from Cloudinary:", publicId);

    await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
    });

    console.log("✅ Image deleted successfully from Cloudinary");
  } catch (error) {
    console.error("❌ Error deleting image from Cloudinary:", error);
    throw new Error("Image deletion failed");
  }
};
const productSchema = Joi.object({
  name: Joi.string().trim().min(2).max(200).required(),
  description: Joi.string().trim().min(5).required(),
  price: Joi.number().min(0).required(),
  stock: Joi.number().min(0).required(),
  status: Joi.string()
    .valid("available", "out_of_stock", "discontinued")
    .default("available"),
  low_stock_threshold: Joi.number().min(0).default(5),

  // ✅ เพิ่ม field ที่ถูกใช้งาน
  // categoryId: Joi.string().required(),
  brand: Joi.string().optional().allow(""),
  sku: Joi.string().optional().allow(""),
  tags: Joi.array().items(Joi.string()).optional().default([]),
  size: Joi.array().items(Joi.string()).optional().default([]),
  colors: Joi.array().items(Joi.string()).optional().default([]),
  is_featured: Joi.boolean().default(false),
  shipping_info: Joi.object({
    weight: Joi.number().min(0).default(0),
    dimensions: Joi.object({
      length: Joi.number().min(0).default(0),
      width: Joi.number().min(0).default(0),
      height: Joi.number().min(0).default(0),
    }).default(),
    shipping_fee: Joi.number().min(0).default(0),
  }).default(),
});

const add_product = async (req, res) => {
  try {
    const { error, value } = productSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    const file = req.files;
    if (error) {
      return res.status(400).json({
        message: "Invalid product data",
        details: error.details.map((err) => err.message),
      });
    }
    
    const newProducts = {
      user_id: req.id,
      name: value.name,
      description: value.description,
      price: value.price,
      stock: value.stock,
      categoryId: value.categoryId,
      images: file,
      status: value.status,
      low_stock_threshold: value.low_stock_threshold,
      size: value.size,
      colors: value.colors,
      brand: value.brand,
      sku: value.sku,
      tags: value.tags,
      is_featured: value.is_featured,
      shipping_info: value.shipping_info,
    };

    // // ✅ Upload image if provided
    if (newProducts.images) {
      try {
        const uploadedImageUrls = await uploadImages(newProducts.images);
        newProducts.images = uploadedImageUrls;
      } catch (uploadError) {
        return res.status(500).json({
          message: "Failed to upload image to Cloudinary.",
          error: uploadError.message,
        });
      }
    }
    const product = new Product(newProducts);
    await product.save();

    return res.status(201).json({
      message: "Product added successfully",
    });
  } catch (error) {
    console.error("❌ Error adding product:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
const get_products = async (req, res) => {
  try {
    const products = await Product.find({ user_id: req.id }).populate(
      "categoryId",
      "name"
    );
    if (!products || products.length === 0) {
      return res.status(404).json({ message: "No products found" });
    }
    return res.status(200).json({ data: products });
  } catch (error) {
    console.error("❌ Error fetching products:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
///
const delete_images_products = async (req, res) => {
  try {
    const { id, index } = req.params;
    // ตรวจสอบว่าได้ id กับ index มาหรือยัง
    if (!id || index === undefined) {
      return res
        .status(400)
        .json({ message: "Missing product ID or image index" });
    }

    // สมมุติคุณมี Product model อยู่ และ images เป็น array
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // ตรวจสอบว่า index อยู่ในช่วง
    if (index < 0 || index >= product.images.length) {
      return res.status(400).json({ message: "Invalid image index" });
    }

    // ลบรูปที่ index นั้นออก
    const findIndex = product?.images?.findIndex((i) =>
      i.includes(Number(index))
    );
    const findImage = product.images[findIndex];
    if (findImage) {
      await delete_image(findImage);
    }
    product.images.splice(index, 1);
    await product.save();

    return res
      .status(200)
      .json({ message: "Image deleted successfully", images: product.images });
  } catch (error) {
    console.error("❌ Error deleting image:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
const update_product = async (req, res) => {
  try {
    const { id } = req.params;
    // Validate ข้อมูลด้วย Joi
    const { error, value } = productSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    console.log("value",value)
    if (error) {
      return res.status(400).json({
        message: "Validation failed",
        details: error.details.map((err) => err.message),
      });
    }

    const files = req.files;
    const existingImages = JSON.parse(req.body.existingImages || "[]");
    if (existingImages && existingImages != []) {
      for (const imageUrl of existingImages) {
        await delete_image(imageUrl);
      }
    }
    // อัปโหลดไฟล์ใหม่ถ้ามี
    let uploadedImagePaths = [];
    if (files && files.length > 0) {
      uploadedImagePaths = await uploadImages(files); // function นี้ต้อง return array
    }

    // รวมรูปเดิม + รูปใหม่
    const allImages = [...existingImages, ...uploadedImagePaths];

    // สร้าง object สำหรับ update
    const update_Products = {
      user_id: req.id,
      name: value.name,
      description: value.description,
      price: value.price,
      stock: value.stock,
      categoryId: req.body.categoryId,
      images: allImages, // ✅ ใส่รวมรูปเดิม + ใหม่
      status: value.status,
      low_stock_threshold: value.low_stock_threshold,
      size: value.size,
      colors: value.colors,
      brand: value.brand,
      sku: value.sku,
      tags: value.tags,
      is_featured: value.is_featured,
      shipping_info: value.shipping_info,
    };

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      update_Products,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.status(200).json({
      message: "Product updated successfully",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("❌ Error updating product:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const update_status = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    // Validate ID
    if (!id) {
      return res.status(400).json({ message: "Invalid or missing product ID" });
    }

    // Validate status
    const allowedStatuses = [
      "available",
      "out_of_stock",
      "temporarily_unavailable",
      "discontinued",
    ]; // Define allowed statuses
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: `Status must be one of: ${allowedStatuses.join(", ")}`,
      });
    }

    // Update only the status field
    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { status }, // Explicitly update only the status field
      {
        new: true, // Return the updated document
        runValidators: true, // Ensure model validators are applied
      }
    );

    // Check if product exists
    if (!updatedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Return success response
    return res.status(200).json({
      message: "Product status updated successfully",
    });
  } catch (error) {
    // Handle specific MongoDB error
    console.error("❌ Error updating product:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
module.exports = {
  add_product,
  get_products,
  update_product,
  delete_images_products,
  update_status,
};
