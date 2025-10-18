const Joi = require("joi");
const mongoose = require("mongoose");
const Product = require("../../models/products");
const cloudinary = require("../../config/clound_images"); // Assuming you have a cloudinary config file
const order = require("../../models/client_models/order");
const Balance = require("../../models/balance");
const redis = require("../../config/redisClient");
const sellers = require("../../models/sellers");
const Transaction = require("../../models/transaction");
const SubscriptionModel = require("../../models/SubscriptionModel");
const {
  refreshRedisProducts,
  refreshRedis_home,
} = require("../client_controllers/products");

const webpush = require("web-push");
const sendPushNotification = async (subscription, payload, userId) => {
  try {
    await webpush.sendNotification(subscription, payload);
    console.log("✅ Push sent to", userId);
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      console.log(
        `❌ Subscription expired for user ${userId}, removing from DB`
      );
      await SubscriptionModel.deleteOne({ userId });
    } else {
      console.error("Push error:", err);
    }
  }
};
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
        // ✅ check mimetype and size
        if (!ALLOWED_FILE_TYPES.includes(image.mimetype)) {
          throw new Error(`ประเภทไฟล์ไม่ถูกต้อง: ${image.mimetype}`);
        }

        if (image.size > MAX_FILE_SIZE) {
          throw new Error(`ຂະໜາດໃຫ່ຍເກີນ ${MAX_FILE_SIZE / 1024 / 1024}MB`);
        }

        // ✅  Promise  stream buffer go Cloudinary
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

          // ❗️ image.buffer
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

    // use regex for  path "upload/"
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
  orginalPrice: Joi.number().min(0).default(0),
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
      categoryId: req.body.categoryId,
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
      orginalPrice: value.orginalPrice,
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

    if (error) {
      return res.status(400).json({
        message: "Validation failed",
        details: error.details.map((err) => err.message),
      });
    }
    // ✅ ดึงสินค้ามาก่อนเพื่อเช็ค access_products เดิม
    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return res.status(404).json({ message: "Product not found" });
    }
    // ✅ เงื่อนไขการกำหนด access_products
    let newAccessStatus = existingProduct.access_products;
    if (
      existingProduct.access_products === "reject" ||
      existingProduct.access_products === "process"
    ) {
      newAccessStatus = "process";
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
      access_products: newAccessStatus, // ✅ ใช้ค่าใหม่
      tags: value.tags,
      is_featured: value.is_featured,
      orginalPrice: value.orginalPrice,
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
    await redis.del(`product:${id}`); // ลบ cache เก่าออกก่อน
    const seller = await sellers.findOne({ user_id: updatedProduct.user_id });
    await redis.set(
      `product:${id}`,
      JSON.stringify({
        product: updatedProduct,
        seller: seller,
      }),
      {
        ex: 3600,
        nx: true,
      }
    );
    await redis.del(`related_products:${id}`);
    await redis.set(`related_products:${id}`, JSON.stringify(updatedProduct), {
      ex: 3600,
      nx: true,
    });
    await refreshRedis_home();
    await refreshRedisProducts();
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
    await redis.del(`product:${id}`); // ลบ cache เก่าออกก่อน
    const seller = await sellers.findOne({ user_id: updatedProduct.user_id });
    await redis.set(
      `product:${id}`,
      JSON.stringify({
        product: updatedProduct,
        seller: seller,
      }),
      {
        ex: 3600,
        nx: true,
      }
    );
    await redis.del(`related_products:${id}`);
    await redis.set(`related_products:${id}`, JSON.stringify(updatedProduct), {
      ex: 3600,
      nx: true,
    });
    await refreshRedis_home();
    await refreshRedisProducts();
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
///get_order
const get_order = async (req, res) => {
  try {
    const { id } = req; // หรือถ้าใช้ JWT ให้เปลี่ยนเป็น req.user.id

    // ✅ query order ที่ status = completed และมี product.user_id = id
    const orderData = await order
      .find({ status: "PAYMENT_COMPLETED" })
      .populate({
        path: "items.productId",
        populate: {
          path: "user_id", // populate user ของ product
        },
      });

    if (!orderData || orderData.length === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    // ✅ filter orders เฉพาะที่ product.user_id === id
    const filteredOrders = orderData.filter((o) =>
      o.items.some((item) => item.productId?.user_id._id?.toString() === id)
    );
    const seller_data = await sellers
      .findOne({ user_id: id })
      .populate("user_id");
    if (filteredOrders.length === 0) {
      return res.status(404).json({ message: "No orders found for this user" });
    }

    res.status(200).json({
      data: filteredOrders,
      seller_data_order: seller_data,
    });
  } catch (error) {
    console.error("❌ Error getting order:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
const update_status_shipping = async (req, res) => {
  try {
    const { id } = req.params;
    const { shipping_status, note, step } = req.body;

    // หา order ก่อน
    const find_order = await order.findById(id).populate("items.productId");
    if (!find_order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // ตรวจสอบว่า step นี้เคยมีแล้วหรือยัง
    const stepExists = find_order.deliverySteps.some((i) => i.step === step);
    if (stepExists) {
      return res.status(400).json({
        message: "This delivery step has already been added.",
      });
    }

    // ✅ กำหนดลำดับสถานะที่ถูกต้อง
    const statusFlow = {
      "Pending": ["Processing", "Cancelled"],
      "Processing": ["Shipped", "Cancelled"],
      "Shipped": ["In_Transit", "Cancelled"],
      "In_Transit": ["Out_for_Delivery", "Cancelled"],
      "Out_for_Delivery": ["Delivered", "Cancelled"],
      "Delivered": [], // สถานะสิ้นสุด
      "Returned": [], // สถานะสิ้นสุด
      "Cancelled": [], // สถานะสิ้นสุด
    };

    const currentStatus = find_order.shipping_status;

    // ✅ ตรวจสอบว่าสถานะปัจจุบันอนุญาตให้เปลี่ยนเป็นสถานะใหม่ได้หรือไม่
    const allowedNextStatuses = statusFlow[currentStatus] || [];
    
    if (!allowedNextStatuses.includes(shipping_status)) {
      return res.status(400).json({
        message: `ไม่สามารถเปลี่ยนสถานะจาก "${currentStatus}" เป็น "${shipping_status}" ได้`,
        currentStatus: currentStatus,
        allowedStatuses: allowedNextStatuses,
      });
    }

    // ✅ ถ้า Cancelled
    if (shipping_status === "Cancelled") {
      // คืน stock และลด sold_count
      for (const item of find_order.items) {
        const product = await Product.findById(item.productId._id);
        if (product) {
          product.stock += item.quantity; // คืนสต็อก
          product.sold_count = Math.max(0, product.sold_count - item.quantity); // กันค่าติดลบ
          await product.save();
        }
        // ลด balance ของ seller
        const sellerBalance = await Balance.findOne({
          seller_id: product.user_id,
        });
        if (sellerBalance) {
          sellerBalance.balance -= find_order.total;
          if (sellerBalance.balance < 0) sellerBalance.balance = 0; // กันค่าติดลบ
          await sellerBalance.save();
        }

        // ลบ transaction ที่ผูกกับ order นี้
        await Transaction.findOneAndDelete({ order_id: find_order?._id });
        
        // redis
        await redis.del(`product:${id}`); // ลบ cache เก่าออกก่อน
        const seller = await sellers.findOne({
          user_id: product.user_id,
        });
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
      }
    }
    
    // อัปเดตสถานะ + เพิ่ม delivery step
    const updatedOrder = await order.findByIdAndUpdate(
      id,
      {
        shipping_status,
        $push: {
          deliverySteps: {
            step,
            note: note || "",
            timestamp: new Date(),
          },
        },
      },
      { new: true }
    );
    
    const subscriptionData = await SubscriptionModel.findOne({
      userId: updatedOrder.user_id,
    });

    if (subscriptionData) {
      const payload = JSON.stringify({
        title: "ຂໍ້ຄວາມໃໝ່",
        body: `ສະຖານະຂອງຄຳສັ່ງ: ${updatedOrder.shipping_status}`,
        url: `https://myshop-x2x.pages.dev/orders/${updatedOrder._id}`,
      });

      await sendPushNotification(
        subscriptionData.subscription,
        payload,
        updatedOrder.user_id
      );
    }
    
    res.status(200).json({
      message: "Order shipping status updated successfully",
      data: updatedOrder,
    });
  } catch (error) {
    console.error("❌ Error updating shipping status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const uploadImageTracking = async (image) => {
  try {
  
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "ecommerce/images_tracking",
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
    await cloudinary.uploader.destroy(`ecommerce/images_tracking/${publicId}`);
  } catch (err) {
    console.error("⚠️ Failed to delete old image from Cloudinary:", err);
  }
};
const update_add_trackingAndImages = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { trackingNumber } = req.body;
    const imagesShipping = req.file; // multer เก็บไฟล์ใหม่ไว้ตรงนี้

    // ✅ หา order
    const orderData = await order.findById(orderId);
    if (!orderData) {
      return res.status(404).json({ message: "Order not found" });
    }

    let newImageUrl = orderData.imagesShipping; // ค่า default = ใช้ของเดิม

    // ✅ ถ้ามีไฟล์ใหม่ → ลบของเดิมออกแล้วแทนที่ด้วยไฟล์ใหม่
    if (imagesShipping) {
      if (orderData.imagesShipping) {
        await deleteCloudinaryImage(orderData.imagesShipping);
      }
      newImageUrl = await uploadImageTracking(imagesShipping);
    }

    // ✅ update เฉพาะ field ที่มีการแก้
    orderData.trackingNumber = trackingNumber || orderData.trackingNumber;
    orderData.imagesShipping = newImageUrl;

    await orderData.save();

    res.status(200).json({
      message: "Order shipping status updated successfully",
      trackingNumber: orderData?.trackingNumber,
      imagesShipping: orderData?.imagesShipping,
    });
  } catch (error) {
    console.error("❌ Error updating shipping status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  add_product,
  get_products,
  update_product,
  delete_images_products,
  update_status,
  get_order,
  update_status_shipping,
  update_add_trackingAndImages,
};
