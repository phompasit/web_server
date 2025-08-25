const Product = require("../../models/products");
const Seller = require("../../models/sellers");
const Cart = require("../../models/client_models/cart");
const Coupon = require("../../models/coupons");
const CouponHold = require("../../models/couponHold");
const Order = require("../../models/client_models/order");
const { default: mongoose } = require("mongoose");
const wishlist = require("../../models/client_models/wishlist");
const axios = require("axios");
const cron = require("node-cron");
const { redis } = require("../../config/redisClient");
const get__products = async (req, res) => {
  try {
    // 1. หาข้อมูลใน Redis ก่อน
    const cachedProducts = await redis.get("all_products");

    if (cachedProducts) {
      console.log("📌 Get products from Redis");
      return res.status(200).json({
        data: JSON.parse(cachedProducts),
        source: "redis",
      });
    }

    // 2. ถ้าไม่มีใน Redis → query DB
    const products = await Product.find({
      access_products: "access",
    });

    // 3. เก็บใน Redis (expire 1 ชั่วโมง = 3600 วินาที)
    await redis.set("all_products", JSON.stringify(products), "EX", 3600);

    console.log("📌 Get products from MongoDB");
    res.status(200).json({
      data: products,
      source: "mongodb",
    });
  } catch (error) {
    console.log("error get_products", error);
    res.status(500).json({
      message: "server error 500",
    });
  }
};
const get__products_id = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. หาใน Redis ก่อน
    const cachedData = await redis.get(`product:${id}`);
    if (cachedData) {
      console.log("📌 Get product by id from Redis");
      return res.status(200).json({
        data: JSON.parse(cachedData),
        source: "redis",
      });
    }

    // 2. ถ้าไม่มีใน Redis → Query DB
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const seller = await Seller.findOne({ user_id: product.user_id });

    const responseData = {
      product,
      seller,
    };

    // 3. เก็บใน Redis (expire 1 ชั่วโมง)
    await redis.set(`product:${id}`, JSON.stringify(responseData), "EX", 3600);

    console.log("📌 Get product by id from MongoDB");
    res.status(200).json({
      data: responseData,
      source: "mongodb",
    });
  } catch (error) {
    console.log("error get_products_id", error);
    res.status(500).json({
      message: "server error 500",
    });
  }
};
const cart = async (req, res) => {
  try {
    const { id } = req;
    const { productsId, quantity, colors, size } = req.body;

    // Find product
    const product = await Product.findById(productsId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Find seller
    const seller = await Seller.findOne({ user_id: product.user_id });
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    // Find user's cart
    let userCart = await Cart.findOne({ userId: id });

    if (!userCart) {
      // Create new cart for user
      userCart = new Cart({
        userId: id,
        cart: [
          {
            sellerId: seller._id,
            items: [
              {
                productId: productsId,
                quantity,
                size,
                colors,
              },
            ],
          },
        ],
      });
    } else {
      // Find seller cart
      let sellerCart = userCart.cart.find(
        (c) => c.sellerId.toString() === seller._id.toString()
      );
      if (!sellerCart) {
        // Add new seller cart
        userCart.cart.push({
          sellerId: seller._id,
          items: [
            {
              productId: productsId,
              quantity,
              size,
              colors,
            },
          ],
        });
      } else {
        sellerCart.items.push({
          productId: productsId,
          quantity,
          size,
          colors,
        });
      }
    }

    await userCart.save();
    res.status(200).json({
      message: "Cart add successfully",
    });
  } catch (error) {
    console.log("error cart", error);
    res.status(500).json({
      message: "Server error 500",
    });
  }
};

const get_cart = async (req, res) => {
  try {
    const { id } = req;
    const data = await Cart.find({ userId: id })
      .populate({
        path: "cart.sellerId",
        model: "sellers_models", // ระบุชื่อ model ให้ชัดเจน
        select: "store_name store_code store_images", // เลือก field ที่อยากได้จาก seller
      })
      .populate({
        path: "cart.items.productId",
        model: "products_models", // ระบุชื่อ model ให้ชัดเจน
      });
    res.status(200).json({
      message: "add cart successfully",
      data: data,
    });
  } catch (error) {
    console.log("error get_cart", error);
    res.status(500).json({
      message: "server error 500",
    });
  }
};
const update_quantity = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    const cart = await Cart.findOne({ userId: req.id });

    if (!cart) return res.status(404).json({ message: "Cart not found" });

    for (const seller of cart.cart) {
      for (const item of seller.items) {
        if (item._id.toString() === id) {
          item.quantity = quantity; // เปลี่ยนจำนวนที่ต้องการ
        }
      }
    }

    await cart.save();
    res.status(200).json({
      message: "update quantity successfully",
    });
  } catch (error) {
    console.log("error update_quantity ", error);
    res.status(500).json({
      message: "server error 500",
    });
  }
};
///get_coupon
const get_coupon = async (req, res) => {
  try {
    const now = new Date();

    // ดึงเฉพาะที่ยังไม่หมดอายุ
    const data = await Coupon.find({
      status: "active",
      end_date: { $gte: now },
    });

    res.status(200).json({
      data,
    });
  } catch (error) {
    console.log("error get_coupon ", error);
    res.status(500).json({
      message: "server error 500",
    });
  }
};
// ทำงานทุกๆ 1 ชั่วโมง (0 * * * * = ทุกชั่วโมง)
// cron.schedule("0 * * * *", async () => {
//   try {
//     const now = new Date();

//     // อัปเดต coupon ที่หมดเวลาแล้ว
//     const result = await Coupon.updateMany(
//       { end_date: { $lt: now }, status: "active" },
//       { $set: { status: "expire" } }
//     );

//     console.log(`Updated ${result.modifiedCount} coupons to expire`);
//   } catch (error) {
//     console.error("Error updating expired coupons:", error);
//   }
// });
const place_order = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req;
    const {
      total,
      subtotal,
      discount,
      shippingCost,
      coupon,
      selectedCartItems,
      couponHold,
    } = req.body;
    await session.withTransaction(async () => {
      // 1. Lock stock for each selected cart item
      for (const item of selectedCartItems) {
        const product = await Product.findById(item.productId).session(session);
        if (!product) {
          throw new Error(`Product ${item.productId} not found`);
        }
        // Check if enough stock is available (considering already locked stock)
        const availableStock = product.stock - (product.locked_stock || 0);
        if (availableStock < item.quantity) {
          throw new Error(
            `Insufficient stock for product ${product.name}. Available: ${availableStock}, Requested: ${item.quantity}`
          );
        }
        // Lock the stock
        await Product.findByIdAndUpdate(
          item.productId,
          {
            $inc: { locked_stock: item.quantity },
            expires_at: new Date(Date.now() + 3 * 60 * 1000), // 10 minutes from now
          },
          { session }
        );
      }
      // 2. Create/Update coupon hold with 10 minutes expiry
      if (coupon && couponHold) {
        const expiresAt = new Date(Date.now() + 3 * 60 * 1000); // 10 minutes
        await CouponHold.findByIdAndUpdate(
          couponHold._id,
          {
            expires_at: expiresAt,
            status: "active",
          },
          {
            session,
          }
        );
      }
      // 3. Create temporary order record
      // NOTE: TempOrder_models is not imported in your code. You should import it at the top.
      const tempOrder = new Order({
        user_id: id,
        items: selectedCartItems,
        total,
        subtotal,
        discount,
        shippingCost,
        coupon: coupon?._id,
        couponHold: couponHold?._id,
        expires_at: new Date(Date.now() + 3 * 60 * 1000), // 10 minutes
        status: "pending_payment",
      });
      // 2️⃣ เตรียม payload สำหรับธนาคาร (เช่น 2C2P)
      await tempOrder.save({ session });
      const payloadData = {
        amount: Number(total), //จำนวนเงินที่ลูกค้าต้องจ่าย
        description: `Order #${tempOrder._id}`,
      };
      let config = {
        method: "post",
        maxBodyLength: Infinity,
        url:
          "https://payment-gateway.lailaolab.com/v1/api/payment/generate-bcel-qr",
        headers: {
          secretKey:
            "$2a$10$CqZnqIMevly0XP1F4YUw/OpCEui/j5xbElcEXDDG5C1s38mSFa/Oa",
          "Content-Type": "application/json",
        },
        data: payloadData,
      };
      const response = await axios.request(config);
      // ส่ง qrCode กลับ frontend
      // console.log("response:", response);
      res.status(200).json({
        message:
          "Order placed successfully, please complete payment within 10 minutes",
        id: tempOrder._id,
        expires_in: 3 * 60 * 1000, // 10 นาที
        qrCode: response.data.qrCode,
        link: response.data.link,
        transactionId: response.data.transactionId,
      });
      // 4. Schedule cleanup job
      scheduleOrderCleanup(tempOrder._id, id, selectedCartItems, couponHold);
    });
    await session.commitTransaction();
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.log("place_order error:", error);
    res.status(500).json({
      message: error.message || "Server error 500",
    });
  } finally {
    session.endSession();
  }
};

// Function to schedule cleanup
const scheduleOrderCleanup = (
  tempOrderId,
  userId,
  selectedCartItems,
  couponHold
) => {
  setTimeout(async () => {
    await cleanupExpiredOrder(
      tempOrderId,
      userId,
      selectedCartItems,
      couponHold
    );
  }, 3 * 60 * 1000); // 10 minutes
};

const cleanupExpiredOrder = async (
  tempOrderId,
  userId,
  selectedCartItems,
  couponHold
) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      //ຄົ້ນຫາ ອໍເດີ
      const tempOrder = await Order.findById(tempOrderId).session(session);

      if (!tempOrder || tempOrder.status !== "pending_payment") {
        return; // Order was already processed or doesn't exist
      }

      // 1. Release locked stock for each item ວົນລູບລ໋ອກສະຕ໋ອກ
      for (const item of selectedCartItems) {
        await Product.findByIdAndUpdate(
          item.productId,
          {
            $inc: { locked_stock: -item.quantity },
            // $unset: { expires_at: 1 }, // Remove TTL
          },
          { session }
        );
      }

      // 2. Release coupon hold
      if (couponHold) {
        await CouponHold.findOneAndUpdate(
          {
            _id: couponHold._id,
            user_id: userId,
            status: "active",
          },
          {
            status: "cancelled",
          },
          { session }
        );
      }

      // 3. Mark temporary order as expired
      await Order.findByIdAndUpdate(
        tempOrderId,
        {
          status: "expired",
        },
        { session }
      );
      await Coupon.updateOne(
        { _id: couponHold?.coupon_id },
        { $inc: { used_count: -1 } }
      );
    });
    await session.commitTransaction();
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error("Error during cleanup:", error);
  } finally {
    session.endSession();
  }
};
const get_temp_order = async (req, res) => {
  try {
    const { id } = req.params;
    const tempOrder = await Order.findById(id)
      .populate("items.productId")
      .populate("coupon")
      .populate("user_id");
    if (!tempOrder) {
      return res.status(404).json({
        message: "Order not found",
        expired: true,
      });
    }

    if (tempOrder.status !== "pending_payment") {
      return res.status(410).json({
        message: "Order is no longer valid",
        expired: true,
        status: tempOrder.status,
      });
    }

    // ตรวจสอบเวลาหมดอายุ
    const timeRemaining = tempOrder.expires_at - new Date();

    if (timeRemaining <= 0) {
      // อัพเดท status เป็น expired
      await Order.findByIdAndUpdate(id, {
        status: "expired",
      });

      return res.status(410).json({
        message: "Order expired",
        expired: true,
      });
    }

    // คำนวณ totals
    const subtotal = tempOrder.items.reduce((sum, item) => {
      return sum + item.price * item.quantity;
    }, 0);

    const discount = tempOrder.discount || 0;
    const shippingCost = tempOrder.shippingCost || 0;
    const total = subtotal + shippingCost - discount;
    res.json({
      data: {
        ...tempOrder.toObject(),
        timeRemaining,
        expired: false,
        // เพิ่มข้อมูลสำหรับ frontend
        summary: {
          subtotal,
          discount,
          shippingCost,
          total,
          itemCount: tempOrder.items.length,
        },
      },
    });
  } catch (error) {
    console.log("get_temp_order error:", error);
    res.status(500).json({
      message: error.message || "Server error 500",
    });
  }
};

const discount = async (req, res) => {
  try {
    const { coupon } = req.body;
    const { id } = req;

    // 1. หา coupon
    const find_coupon = await Coupon.findOne({
      coupon_code: coupon.coupon_code,
    });
    if (!find_coupon) {
      return res.status(404).json({ message: "Coupon ไม่พบ" });
    }

    // 2. เช็ควันหมดอายุ
    if (find_coupon.end_date && find_coupon.end_date < new Date()) {
      return res.status(400).json({ message: "คูปองหมดอายุแล้ว" });
    }

    // 3. เช็คสิทธิ์คงเหลือ
    const now = new Date();
    const availableCount = find_coupon.usage_limit - find_coupon.used_count;
    if (availableCount <= 0) {
      return res.status(400).json({ message: "คูปองถูกใช้หมดแล้ว" });
    }

    // 4. ตัด quota ชั่วคราว + สร้าง hold
    const expiresAt = new Date(Date.now() + 1 * 60 * 1000); // 5 นาที
    await Coupon.updateOne(
      { _id: find_coupon._id },
      { $inc: { used_count: 1 } } // ตัด quota ทันที
    );
    await CouponHold.create({
      coupon_id: find_coupon._id,
      user_id: id,
      expires_at: expiresAt,
      status: "active",
    });

    res.status(200).json({
      message: "จองคูปองสำเร็จ (5 นาที)",
    });
  } catch (error) {
    console.log("discount error", error);
    res.status(500).json({
      message: "server error 500",
    });
  }
};
const cancelCoupon = async (req, res) => {
  try {
    const { coupon } = req.body;
    const userId = req.id;
    // หา hold ที่เป็นของ user นี้
    const hold = await CouponHold.findOne({
      coupon_id: coupon._id,
      user_id: userId,
      status: { $in: ["active"] },
    });

    if (!hold) {
      return res.status(404).json({ message: "ไม่พบคูปองที่ต้องการยกเลิก" });
    }

    // 1. คืน quota ให้ coupon
    await Coupon.updateOne(
      { _id: hold.coupon_id },
      { $inc: { used_count: -1 } }
    );

    // 2. เปลี่ยนสถานะ hold เป็น cancelled
    hold.status = "cancelled";
    await hold.save();

    // 3. (optional) ลบ record ทิ้งถ้าไม่ต้องเก็บประวัติ
    // await CouponHold.deleteOne({ _id: hold._id });

    res.status(200).json({
      message: "ยกเลิกคูปองเรียบร้อยแล้ว และคืน quota ให้ระบบ",
    });
  } catch (error) {
    console.error("cancelCoupon error:", error);
    res.status(500).json({ message: "server error 500" });
  }
};
//couthold
const couponHold = async (req, res) => {
  try {
    const { id } = req;
    const find_data = await CouponHold.find({ user_id: id });
    res.status(200).json({
      data: find_data,
    });
  } catch (error) {
    console.error(" couponHold  error:", error);
    res.status(500).json({ message: "server error 500" });
  }
};
const wishlist_add = async (req, res) => {
  try {
    const { productsId, note } = req.body;
    const userId = req.id;
    // ตรวจสอบการล็อกอิน
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // ตรวจสอบ productId
    if (!productsId) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    // ตรวจสอบว่าสินค้ามีอยู่จริง
    const productExists = await Product.findById(productsId);
    if (!productExists) {
      return res.status(404).json({ message: "Product not found" });
    }

    // เช็คว่ามีใน wishlist หรือยัง
    const existingItem = await wishlist.findOne({
      userId: userId,
      productId: productsId,
    });

    if (existingItem) {
      // ถ้ามีแล้ว ให้ลบออก
      await wishlist.deleteOne({ _id: existingItem._id });
      return res.status(200).json({
        message: "Product removed from wishlist",
      });
    }

    // ถ้ายังไม่มี ให้เพิ่มเข้า wishlist
    const wishlistItem = await wishlist.create({
      userId: userId,
      productId: productsId,
      note,
      addedAt: new Date(),
    });

    await wishlistItem.populate("productId");

    res.status(200).json({
      message: "Product added to wishlist",
    });
  } catch (error) {
    console.error("wishlist_toggle error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

///ລາຍການໂປຣດສິນຄ້າອັນດຽວ ຫາດ້ວຍໄອດິ
const get_wishlist = async (req, res) => {
  try {
    const userId = req.id;
    const { productId } = req.params;

    // เช็คว่า productId เป็น ObjectId ที่ถูกต้อง
    if (!productId) {
      return res.status(400).json({ message: "Invalid product ID" });
    }
    // 2. ถ้าไม่มีใน Redis → query DB
    const find_wishlist = await wishlist
      .findOne({
        userId: userId,
        productId: productId,
      })
      .populate("productId");

    res.status(200).json({
      data: find_wishlist,
    });
  } catch (error) {
    console.error("wishlist_get error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const get_wishlist_all = async (req, res) => {
  try {
    const { id } = req;
    const get_data = await wishlist.find({ userId: id }).populate("productId");
    res.status(200).json({
      data: get_data,
    });
  } catch (error) {
    console.error("wishlist_get error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
const delete_cart_item_products = async (req, res) => {
  try {
    const { cartId, productId } = req.params;

    res.status(200).json({
      message: "success delete products",
    });
  } catch (error) {
    console.log(error);
  }
};
const delete_items = async (req, res) => {
  try {
    const { cartId, cart_id, id } = req.params;

    const itemId = id;

    // ลบ item ก่อน
    let updatedCart = await Cart.findOneAndUpdate(
      { _id: cartId, "cart._id": cart_id },
      { $pull: { "cart.$.items": { _id: itemId } } },
      { new: true }
    );

    // ลบ cart ที่ไม่มี items เหลือ
    updatedCart = await Cart.findOneAndUpdate(
      { _id: cartId },
      { $pull: { cart: { items: { $size: 0 } } } },
      { new: true }
    );

    res.status(200).json({
      message: "Item deleted successfully",
      cart: updatedCart,
    });
  } catch (error) {
    console.error("delete_items error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
////ສິນຄ້າແນະນຳ ສິນຄ້າໃໝ່ລ່າສຸດ
// 📌 รวม API เดียว
const get_home_products = async (req, res) => {
  try {
    // 1. ลองดึงจาก Redis ก่อน
    const cached = await redis.get("home_products");
    if (cached) {
      console.log("📌 Get home_products from Redis");
      return res.status(200).json({
        data: JSON.parse(cached),
        source: "redis",
      });
    }

    // 2. Query DB  ຖ້າຕ້ອງການເພີ່ມຍອດນິຍົມ ກໍເພີມເຂົ້າໃນນີ້
    const [featured, latest] = await Promise.all([
      Product.find({ is_featured: true, access_products: "access" }).limit(10),
      Product.find({ access_products: "access" })
        .sort({ createdAt: -1 })
        .limit(10),
    ]);

    const data = { featured, latest };

    // 3. เก็บ cache ไว้ 1 ชั่วโมง
    await redis.set("home_products", JSON.stringify(data), "EX", 3600);
    console.log("📌 Get home_products from MongoDB");
    res.status(200).json({
      data,
      source: "mongodb",
    });
  } catch (error) {
    console.error("get_home_products error:", error);
    res.status(500).json({ message: "server error 500" });
  }
};
// 📌 ดึงสินค้าที่เกี่ยวข้อง
const get_related_products = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. ลองเช็ค Redis ก่อน
    const cached = await redis.get(`related_products:${id}`);
    if (cached) {
      console.log("📌 Get related_products from Redis");
      return res.status(200).json({
        data: JSON.parse(cached),
        source: "redis",
      });
    }

    // 2. หาสินค้าต้นแบบ
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // 3. Query สินค้าที่เกี่ยวข้อง (category + tags เดียวกัน)
    const related = await Product.find({
      _id: { $ne: id }, // ไม่เอาตัวเอง
      $or: [
        { categoryId: product.categoryId },
        { tags: { $in: [product.tags] } },
      ],
      access_products: "access",
    }).limit(10);

    const data = { product, related };

    // 4. เก็บใน Redis (expire 1 ชั่วโมง)
    await redis.set(`related_products:${id}`, JSON.stringify(data), "EX", 3600);

    console.log("📌 Get related_products from MongoDB");
    res.status(200).json({
      data,
      source: "mongodb",
    });
  } catch (error) {
    console.error("get_related_products error:", error);
    res.status(500).json({ message: "server error 500" });
  }
};
const update_carts = async (req, res) => {
  try {
    const { cartId, cart_id, id } = req.params;
    const { size, colors } = req.body;
    // ອັບເດດຂໍ້ມູນ
    await Cart.findOneAndUpdate(
      { _id: cartId, "cart._id": cart_id },
      {
        $set: {
          "cart.$.items.$[elem].size": size,
          "cart.$.items.$[elem].colors": colors,
        },
      },
      {
        arrayFilters: [{ "elem._id": id }],
        new: true,
      }
    );
    res.status(200).json({
      message: "update successfully",
    });
  } catch (error) {
    console.error("update_cart error:", error);
    res.status(500).json({ message: "server error 500" });
  }
};

const createFlashSale = async (req, res) => {
  try {
    const { productId, discountPercent, startTime, endTime } = req.body;
    const { id } = req;
    const flashSale = await FlashSale.create({
      user_id: id,
      productId,
      discountPercent,
      startTime,
      endTime,
    });

    res.status(201).json(flashSale);
  } catch (error) {
    res.status(500).json({ error: "Failed to create flash sale" });
  }
};
// ทุก 1 นาทีเช็ค Flash Sale
// cron.schedule("* * * * *", async () => {
//   const now = new Date();

//   // เริ่ม Flash Sale
//   const sales = await FlashSale.find({ startTime: { $lte: now }, status: "scheduled" });
//   for (let sale of sales) {
//     sale.status = "active";
//     await sale.save();

//     // Trigger Notification
//     await NotificationService.sendToAllUsers({
//       title: "🔥 Flash Sale เริ่มแล้ว!",
//       message: `สินค้าลด ${sale.discountPercent}% รีบซื้อก่อนหมดเวลา!`,
//       link: `/product/${sale.productId}`
//     });
//   }

//   // จบ Flash Sale
//   const ended = await FlashSale.find({ endTime: { $lte: now }, status: "active" });
//   for (let sale of ended) {
//     sale.status = "ended";
//     await sale.save();
//   }
// });
// const payment = async (req, res) => {
//   try {
//     const { coupon_id } = req.body;
//     const { id } = req;

//     // อัพเดต hold เป็น "used" เพื่อไม่ให้โดน cleanExpiredHolds ลบ
//     await CouponHold.updateOne(
//       { coupon_id, user_id: id, status: "active" },
//       { $set: { status: "used" } }
//     );

//     res.status(200).json({ message: "ชำระเงินสำเร็จ" });

//   } catch (error) {
//     console.error("payment error", error);
//     res.status(500).json({ message: "server error 500" });
//   }
// };
module.exports.get__products = get__products;
module.exports.get__products_id = get__products_id;
module.exports.cart = cart;
module.exports.get_cart = get_cart;
module.exports.update_quantity = update_quantity;
module.exports.place_order = place_order;
module.exports.get_coupon = get_coupon;
module.exports.discount = discount;
module.exports.cancelCoupon = cancelCoupon;
module.exports.couponHold = couponHold;
module.exports.get_temp_order = get_temp_order;
module.exports.wishlist_add = wishlist_add;
module.exports.get_wishlist = get_wishlist;
module.exports.get_wishlist_all = get_wishlist_all;
module.exports.delete_cart_item_products = delete_cart_item_products;
module.exports.delete_items = delete_items;
module.exports.get_home_products = get_home_products;
module.exports.get_related_products = get_related_products;
module.exports.update_carts = update_carts;
module.exports.createFlashSale = createFlashSale;

//     // Add item to existing seller cart
//     // const check = sellerCart.items.find(
//     //   (i) => i.productId.toString() === productsId.toString()
//     // );
//     // if (check) {
//     //   // Increment quantity if product already exists in cart
//     //   check.quantity += quantity;
//     // } else {
//     //   sellerCart.items.push({
//     //     productId: productsId,
//     //     quantity,
//     //     size,
//     //     colors,
//     //   });
//   // }
