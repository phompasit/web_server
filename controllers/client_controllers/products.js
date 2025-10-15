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
const redis = require("../../config/redisClient");
const Transaction = require("../../models/transaction");
const Balance = require("../../models/balance");
const SubscriptionModel = require("../../models/SubscriptionModel");
const webpush = require("web-push");
const notification = require("../../models/notification");
const ioClient = require("socket.io-client");
const express = require("express");
const Review = require("../../models/reviews");
const cloudinary = require("../../config/clound_images");
const User = require("../../models/user");
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

const refreshRedis_home = async (req, res) => {
  try {
    // ลบ cache เดิม
    await redis.del("home_products");

    // ดึง seller เฉพาะ field ที่จำเป็น
    const sellers = await Seller.find().select(
      "user_id store_name store_code store_images _id address"
    );

    // ดึง products 2 กลุ่ม
    const [featured, latest, topRating] = await Promise.all([
      Product.find({
        is_featured: true,
        access_products: "access",
        status: "available",
      })
        .populate("categoryId")
        .limit(10),
      Product.find({ access_products: "access", status: "available" })
        .populate("categoryId")
        .sort({ createdAt: -1 })
        .limit(10),
      Product.find({
        access_products: "access",
        status: "available",
      })
        .populate("categoryId")
        .sort({
          averageRating: -1,
        }) // ⭐ เรียงจากคะแนนสูงสุดลงต่ำสุด
        .limit(10), // เอาแค่ 10 อันดับ
    ]);

    // ฟังก์ชันช่วย map product + seller
    const attachSeller = (products) =>
      products.map((product) => {
        const seller = sellers.find(
          (s) => String(s.user_id) === String(product.user_id)
        );
        return {
          ...product.toObject(),
          seller: seller || null,
        };
      });

    const data = {
      featured: attachSeller(featured),
      latest: attachSeller(latest),
      topRating: attachSeller(latest),
    };

    // เก็บ cache 1 ชั่วโมง
    await redis.set("home_products", JSON.stringify(data), {
      ex: 3600,
      nx: true,
    });
    console.log("📌 Refresh home_products success", data);

    return { data, source: "mongodb" };
  } catch (error) {
    console.error("❌ Failed to refresh Redis home_products:", error);
    res.status(500).json({ message: "server error 500" });
  }
};

// รีเฟรชข้อมูลสินค้าใน Redis
const refreshRedisProducts = async () => {
  try {
    await redis.del("all_products");
    // ดึงข้อมูลล่าสุดจาก MongoDB
    const products = await Product.find({
      access_products: "access",
      status: "available",
    }).populate("categoryId");
    const sellers = await Seller.find().select(
      "user_id store_name store_code store_images _id address"
    );
    const data = products.map((product) => {
      const seller = sellers.find(
        (s) => String(s.user_id) === String(product.user_id) // เทียบ user_id
      );
      return {
        ...product.toObject(), // copy field ของ product
        seller: seller || null, // ✅ เพิ่ม seller เข้าไป
      };
    });
    // เซ็ตค่าใหม่ใน Redis (expire 1 ชม.)
    await redis.set("all_products", JSON.stringify(data), {
      ex: 3600,
      nx: true,
    });
    // 3. เก็บ cache ไว้ 1 ชั่วโมง
    // 4. เก็บใน Redis (expire 1 ชั่วโมง)
    console.log("✅ Redis products refreshed");
    await refreshRedis_home();
    return data;
  } catch (error) {
    console.error("❌ Failed to refresh Redis products:", error);
  }
};

const get__products = async (req, res) => {
  try {
    // 1. หาข้อมูลใน Redis ก่อน
    const cachedProducts = await redis.get("all_products");
    if (cachedProducts) {
      console.log("📌 Get products from Redis");
      return res.status(200).json({
        data: cachedProducts,
        source: "redis",
      });
    }

    // 2. ถ้าไม่มีใน Redis → query DB
    const products = await Product.find({
      access_products: "access",
      status: "available",
    }).populate("categoryId");
    const sellers = await Seller.find().select(
      "user_id store_name store_code store_images _id address"
    );
    const data = products.map((product) => {
      const seller = sellers.find(
        (s) => String(s.user_id) === String(product.user_id) // เทียบ user_id
      );
      return {
        ...product.toObject(), // copy field ของ product
        seller: seller || null, // ✅ เพิ่ม seller เข้าไป
      };
    });
    // 3. เก็บใน Redis (expire 1 ชั่วโมง = 3600 วินาที)
    await redis.set("all_products", JSON.stringify(data), {
      ex: 3600,
      nx: true,
    });

    res.status(200).json({
      data: data,
      source: "mongodb",
    });
  } catch (error) {
    console.log("error get_products", error);
    res.status(500).json({
      message: "server error 500",
    });
  }
};

// ✅ MOVE Socket.IO initialization function here
const onSubscribePaymentSupport = async (io) => {
  // const  io = req.app.get("io")
  const _socketPaymentUrl = "https://payment-gateway.lailaolab.com";
  const socket = ioClient(_socketPaymentUrl);
  // Track active client connections
  let session;
  try {
    // Connect to the server
    socket.on("connect", () => {
      console.log("Connected to the payment Support server!");
      // Subscribe to a custom event

      socket.on("join::" + process.env.PAYMENT_KEY, async (data) => {
        try {
          session = await mongoose.startSession();
          await session.startTransaction();
          // SECRET_KEY  taken from to PhaJay Portal

          const find_order = await Order.findOne({
            transactionId: data.transactionId,
          }).session(session);

          if (!find_order) {
            await session.abortTransaction();
            session.endSession();
            return;
          }

          function generateUnique6Digits() {
            const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
            let result = "";
            for (let i = 0; i < 6; i++) {
              const index = Math.floor(Math.random() * digits.length);
              result += digits[index];
              digits.splice(index, 1);
            }
            return result;
          }

          const orderId = generateUnique6Digits();
          // ฟังก์ชันแปลง DD/MM/YYYY HH:mm:ss เป็น Date Object
          const parsePaymentDateTime = (dateTimeString) => {
            // "14/10/2025 13:34:13" -> Date Object
            const [datePart, timePart] = dateTimeString.split(" ");
            const [day, month, year] = datePart.split("/");
            const [hour, minute, second] = timePart.split(":");

            return new Date(year, month - 1, day, hour, minute, second);
          };
          const updatedOrder = await Order.findOneAndUpdate(
            { transactionId: data.transactionId },
            {
              orderId: orderId,
              status: data.status,
              shipping_status: "pending",
              refNo: data.refNo,
              sourceName: data.sourceName,
              exReferenceNo: data.exReferenceNo,
              paymentMethod: data.paymentMethod,
              payment_time: parsePaymentDateTime(data.txnDateTime),
              sourceAccount: data.sourceAccount,
              deliverySteps: [
                {
                  step: "order_placed",
                  note: "ໄດ້ຮັບຄຳສັ່ງຊື້ແລະຊຳລະເງິນແລ້ວ",
                },
              ],
            },
            { new: true, session }
          );

          if (!updatedOrder) {
            throw new Error("Failed to update order");
          }

          for (const item of updatedOrder.items) {
            await redis.del(`product:${item.productId.toString()}`);
          }

          const find_cart = await Cart.findOne({
            userId: updatedOrder.user_id,
          }).session(session);

          if (find_cart) {
            find_cart.cart = find_cart.cart
              .map((seller) => {
                seller.items = seller.items.filter(
                  (i) =>
                    !find_order.selectedItems.some(
                      (item) => item.toString() === i._id.toString()
                    )
                );
                return seller;
              })
              .filter((seller) => seller.items.length > 0);

            if (find_cart.cart.length === 0) {
              await Cart.deleteOne({ _id: find_cart._id }).session(session);
            } else {
              await find_cart.save({ session });
            }
          }

          if (updatedOrder.status === data.status) {
            for (const item of find_order.items) {
              const updatedProduct = await Product.findByIdAndUpdate(
                item.productId,
                {
                  $inc: {
                    locked_stock: -item.quantity,
                    sold_count: item.quantity,
                    stock: -item.quantity,
                  },
                },
                { new: true, session }
              );

              if (!updatedProduct) {
                throw new Error(`Product not found: ${item.productId}`);
              }

              await redis.set(
                `product:${item.productId}`,
                JSON.stringify(updatedProduct),
                {
                  ex: 3600,
                  nx: true,
                }
              );

              const transaction_seller = new Transaction({
                seller_id: updatedProduct.user_id,
                order_id: updatedOrder._id,
                subtotal: updatedOrder.total,
                fee_system: updatedOrder.fee_system,
                total_summary: updatedOrder.total_summary,
                status: "pending_payout",
                transaction_type: "sale",
              });
              await transaction_seller.save({ session });

              const checkTransaction = await Balance.findOne({
                seller_id: updatedProduct.user_id,
              }).session(session);

              if (checkTransaction) {
                checkTransaction.balance += updatedOrder.total_summary;
                await checkTransaction.save({ session });
              } else {
                const balance_seller = new Balance({
                  seller_id: updatedProduct.user_id,
                  balance: updatedOrder.total_summary,
                });
                await balance_seller.save({ session });
              }

              const subscriptionData = await SubscriptionModel.findOne({
                userId: updatedProduct.user_id,
              });

              if (subscriptionData) {
                const payload = JSON.stringify({
                  title: "ທ່ານມີອໍເດີໃຫມ່ເຂົ້າມາ ຄຶກເບີ່ງລາຍລະອຽດ",
                  body: "ອໍເດີເຂົ້າໃຫມ່ ຮີບກວດສອບ ຈັດສົ່ງ",
                  url: "http://localhost:5174",
                });

                sendPushNotification(
                  subscriptionData.subscription,
                  payload,
                  updatedProduct.user_id
                ).catch((err) =>
                  console.error("Push notification error:", err)
                );

                // await notification.create({
                //   order_id: updatedOrder._id,
                //   user_id: updatedProduct.user_id,
                //   message: "ທ່ານມີອໍເດີໃຫມ່ເຂົ້າມາ",
                // });
              }
            }

            if (find_order.couponHold) {
              await CouponHold.findByIdAndUpdate(
                find_order.couponHold,
                { status: "converted" },
                { session }
              );
            }

            if (find_order.coupon) {
              const updatedCoupon = await Coupon.findByIdAndUpdate(
                find_order.coupon,
                { $inc: { usage_limit: -1, used_count: 1 } },
                { new: true, session }
              );

              if (updatedCoupon) {
                await redis.set(
                  `coupon:${find_order.coupon}`,
                  JSON.stringify(updatedCoupon),
                  {
                    ex: 3600,
                    nx: true,
                  }
                );
              }
            }
          }

          await session.commitTransaction();
          session.endSession();

          await redis.set(
            `order:${updatedOrder._id}`,
            JSON.stringify(updatedOrder),
            {
              ex: 3600,
              nx: true,
            }
          );

          await refreshRedisProducts();
          const paymentClients = await io.of("/payment").fetchSockets();

          if (paymentClients.length > 0) {
            io.of("/payment").emit("paymentStatus", {
              transactionId: updatedOrder.transactionId,
              status: updatedOrder.status,
              orderId: updatedOrder.orderId,
              id: updatedOrder._id,
            });
            console.log(
              "📡 Emitting paymentStatus to /payment clients",
              paymentClients.length
            );
          } else {
            console.log("⚠️ No clients connected to /payment yet");
          }
        } catch (error) {
          console.error(" failed:", error);
        }
      });
    });
    // Handle the connection error (optional)
    socket.on("connect_error", (error) => {
      console.error("Connection failed:", error);
    });
    return;
  } catch (error) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    console.log({ error });
  }
};
const get__products_id = async (req, res) => {
  try {
    const { id } = req.params;
    const products = await redis.get(`product:${id}`);

    // 1. หาใน Redis ก่อน
    const cachedData = await redis.get(`product:${id}`);
    // 2. ถ้าไม่มีใน Redis → Query DB
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const seller = await Seller.findOne({ user_id: product.user_id });
    if (cachedData) {
      console.log("📌 Get product by id from Redis");
      return res.status(200).json({
        data: cachedData,
        source: "redis",
      });
    }

    const responseData = {
      product,
      seller,
    };

    // 3. เก็บใน Redis (expire 1 ชั่วโมง)
    await redis.set(`product:${id}`, JSON.stringify(responseData), {
      ex: 3600,
      nx: true,
    });

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
    if (
      product.access_products === "process" ||
      product.access_products === "rejected"
    ) {
      return res.status(404).json({
        message: "ບໍ່ສາມາດສັ່ງຊື້ໄດ້ ສິນຄ້າຖືກລະງັບ ກະລຸນາເລືອກສິນຄ້າໃຫມ່",
      });
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
// ฟังก์ชันคำนวณยอดรวมและส่วนลด (ใช้ร่วมกัน)
const calculateOrderSummary = async (
  userId,
  selectedItems,
  couponCode = null
) => {
  // ดึงข้อมูล Cart
  const cart = await Cart.findOne({ userId })
    .populate({
      path: "cart.items.productId",
      select: "name price stock images user_id",
    })
    .populate({
      path: "cart.sellerId",
      select: "store_name store_code fee_system",
    });

  if (!cart) {
    throw new Error("ບໍ່ພົບຕະກ້າສິນຄ້າ");
  }

  // รวบรวมสินค้าที่เลือก
  let selectedCartItems = [];
  let subtotal = 0;
  let sellers = new Map(); // เก็บข้อมูล seller แต่ละรายเพื่อคำนวณ fee

  cart.cart.forEach((store) => {
    store.items.forEach((item) => {
      if (selectedItems.includes(item._id.toString())) {
        const product = item.productId;

        // ตรวจสอบ stock
        if (item.quantity > product.stock) {
          throw new Error(
            `${product.name} ມີສິນຄ້າບໍ່ພຽງພໍ (ເຫຼືອ ${product.stock})`
          );
        }

        const itemTotal = product.price * item.quantity;
        subtotal += itemTotal;

        selectedCartItems.push({
          _id: item._id,
          productId: product._id,
          storeId: store.sellerId._id,
          name: product.name,
          price: product.price,
          quantity: item.quantity,
          color: item.colors,
          size: item.size,
          total: itemTotal,
          user_id: product.user_id,
        });

        // เก็บข้อมูล seller
        if (!sellers.has(store.sellerId._id.toString())) {
          sellers.set(store.sellerId._id.toString(), {
            sellerId: store.sellerId._id,
            storeName: store.sellerId.store_name,
            feeSystem: store.sellerId.fee_system || 0,
          });
        }
      }
    });
  });

  if (selectedCartItems.length === 0) {
    throw new Error("ກະລຸນາເລືອກສິນຄ້າ");
  }

  let discount = 0;
  let applicableCoupon = null;

  // คำนวณส่วนลดถ้ามี coupon
  if (couponCode) {
    const couponResult = await calculateCouponDiscount(
      couponCode,
      selectedCartItems,
      subtotal,
      userId
    );

    if (couponResult.success) {
      discount = couponResult.discount;
      applicableCoupon = couponResult.coupon;
    }
  }

  const shippingCost = 0; // คำนวณค่าจัดส่งตามต้องการ
  const total = subtotal - discount + shippingCost;

  return {
    selectedCartItems,
    subtotal,
    discount,
    shippingCost,
    total: Math.max(0, total),
    applicableCoupon,
    sellers: Array.from(sellers.values()),
  };
};

// ตรวจสอบและคำนวณส่วนลดจาก Coupon
const calculateCouponDiscount = async (
  couponCode,
  selectedItems,
  subtotal,
  userId
) => {
  try {
    // หา Coupon
    const coupon = await Coupon.findOne({
      coupon_code: couponCode.toUpperCase(),
      status: "active",
      start_date: { $lte: new Date() },
      end_date: { $gte: new Date() },
    });

    if (!coupon) {
      throw new Error("ໂຄ້ດສ່ວນຫຼຸດບໍ່ຖືກຕ້ອງຫຼືໝົດອາຍຸ");
    }

    // ตรวจสอบจำนวนครั้งที่ใช้
    const availableQuota = coupon.usage_limit - coupon.used_count;
    if (availableQuota <= 0) {
      throw new Error("ໂຄ້ດສ່ວນຫຼຸດຖືກໃຊ້ໝົດແລ້ວ");
    }

    // ตรวจสอบยอดขั้นต่ำ
    if (subtotal < coupon.min_order_amount) {
      throw new Error(
        `ຍອດຂັ້ນຕໍ່າສັ່ງຊື້ ${coupon.min_order_amount.toLocaleString()} ກີບ`
      );
    }

    // กรองสินค้าที่ใช้คูปองได้
    let applicableItems = [];

    switch (coupon.applicable_type) {
      case "all_system":
        applicableItems = selectedItems;
        break;

      case "specific_products":
        applicableItems = selectedItems.filter((item) =>
          coupon.applicable_products.some(
            (prodId) => prodId.toString() === item.productId.toString()
          )
        );
        break;

      case "specific_stores":
        applicableItems = selectedItems.filter((item) =>
          coupon.applicable_stores.some(
            (storeId) => storeId.toString() === item.storeId.toString()
          )
        );
        break;

      default:
        throw new Error("ປະເພດໂຄ້ດສ່ວນຫຼຸດບໍ່ຖືກຕ້ອງ");
    }

    if (applicableItems.length === 0) {
      throw new Error("ບໍ່ມີສິນຄ້າທີ່ສາມາດໃຊ້ໂຄ້ດສ່ວນຫຼຸດນີ້ໄດ້");
    }

    // คำนวณยอດรวมของสินค้าที่ใช้ได้
    const applicableSubtotal = applicableItems.reduce(
      (sum, item) => sum + item.total,
      0
    );

    // คำนวณส่วนลด
    let discount = 0;

    switch (coupon.discount_type) {
      case "percentage":
        discount = (applicableSubtotal * coupon.discount_value) / 100;
        if (
          coupon.max_discount_amount &&
          discount > coupon.max_discount_amount
        ) {
          discount = coupon.max_discount_amount;
        }
        break;

      case "fixed":
        discount = Math.min(coupon.discount_value, applicableSubtotal);
        break;

      case "shipping":
        discount = Math.min(coupon.discount_value, 100);
        break;

      default:
        discount = 0;
    }

    return {
      success: true,
      discount: Math.min(discount, applicableSubtotal),
      coupon: {
        _id: coupon._id,
        coupon_code: coupon.coupon_code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
      },
      applicableItemsCount: applicableItems.length,
    };
  } catch (error) {
    return {
      success: false,
      discount: 0,
      error: error.message,
    };
  }
};

// API: คำนวณยอดรวม
exports.calculateOrderSummaryAPI = async (req, res) => {
  try {
    const { selectedItems, couponCode } = req.body;
    const userId = req.id; // จาก middleware auth

    if (!selectedItems || selectedItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "ກະລຸນາເລືອກສິນຄ້າ",
      });
    }

    const summary = await calculateOrderSummary(
      userId,
      selectedItems,
      couponCode
    );

    res.json({
      success: true,
      subtotal: summary.subtotal,
      discount: summary.discount,
      shippingCost: summary.shippingCost,
      total: summary.total,
      applicableCoupon: summary.applicableCoupon,
      selectedItemsCount: summary.selectedCartItems.length,
    });
  } catch (error) {
    console.error("Calculate summary error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "ເກີດຂໍ້ຜິດພາດໃນການຄຳນວນ",
    });
  }
};

// API: Validate และ Apply Coupon
exports.validateCoupon = async (req, res) => {
  try {
    const { couponCode, selectedItems } = req.body;
    const userId = req.id;

    if (!selectedItems || selectedItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "ກະລຸນາເລືອກສິນຄ້າ",
      });
    }

    // คำนวณเพื่อ validate
    const summary = await calculateOrderSummary(
      userId,
      selectedItems,
      couponCode
    );

    if (summary.discount === 0) {
      return res.status(400).json({
        success: false,
        message: "ບໍ່ສາມາດໃຊ້ໂຄ້ດສ່ວນຫຼຸດນີ້ໄດ້",
      });
    }

    // สร้าง Coupon Hold
    const holdDuration = 5 * 60 * 1000; // 5 minutes
    const expiresAt = new Date(Date.now() + holdDuration);

    // ลบ hold เก่าที่หมดอายุ
    await CouponHold.deleteMany({
      userId,
      status: "active",
      expires_at: { $lt: new Date() },
    });

    // สร้าง hold ใหม่
    const couponHold = await CouponHold.create({
      userId,
      coupon_id: summary.applicableCoupon._id,
      expires_at: expiresAt,
      status: "active",
    });

    res.json({
      success: true,
      coupon: summary.applicableCoupon,
      discountAmount: summary.discount,
      holdId: couponHold._id,
      expiresAt,
    });
  } catch (error) {
    console.error("Validate coupon error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "ເກີດຂໍ້ຜິດພາດ",
    });
  }
};

// Cleanup function สำหรับ order ที่หมดเวลา
const scheduleOrderCleanup = (
  orderId,
  userId,
  selectedCartItems,
  couponHold
) => {
  setTimeout(async () => {
    try {
      const order = await Order.findById(orderId);

      if (order && order.status === "pending_payment") {
        // 1. คืน stock
        for (const item of selectedCartItems) {
          await Product.findByIdAndUpdate(item.productId, {
            $inc: { locked_stock: -item.quantity },
          });
        }

        // 2. ปล่อย coupon hold
        if (couponHold && couponHold._id) {
          await CouponHold.findByIdAndUpdate(couponHold._id, {
            status: "expired",
          });
        }

        // 3. อัปเดต order status
        order.status = "expired";
        await order.save();

        console.log(`Order ${orderId} expired and cleaned up`);
      }
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  }, 5 * 60 * 1000); // 3 minutes
};

// API: Place Order พร้อมคำนวณทุกอย่างฝั่ง Backend
// const bankEndpoints = {
//   bcel: process.env.BCEL,
//   // jdb: process.env.JDB,
//   // ldb: process.env.LDB,
// };

// const url = bankEndpoints[selectedBank];
// if (!url) {
//   throw new Error("Invalid bank selection");
// }
const place_order = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req;
    const {
      selectedItems,
      couponCode,
      couponHoldId,
      shippingAddress,
      selectedBank,
    } = req.body;

    // ตรวจสอบที่อยู่
    if (!shippingAddress) {
      return res.status(400).json({
        success: false,
        message: "ກະລຸນາເລືອກທີ່ຢູ່ຈັດສົ່ງ",
      });
    }

    // ตรวจสอบสินค้าที่เลือก
    if (!selectedItems || selectedItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "ກະລຸນາເລືອກສິນຄ້າ",
      });
    }

    await session.withTransaction(async () => {
      // 1. คำนวณยอดรวมทั้งหมดฝั่ง Backend
      const summary = await calculateOrderSummary(
        id,
        selectedItems,
        couponCode
      );

      const {
        selectedCartItems,
        subtotal,
        discount,
        shippingCost,
        total,
        applicableCoupon,
        sellers,
      } = summary;

      // 2. ตรวจสอบและล็อค stock
      for (const item of selectedCartItems) {
        const product = await Product.findById(item.productId).session(session);

        if (!product) {
          return res
            .status(400)
            .json({ message: `Product ${item.productId} not found` });
        }

        // Check available stock
        const availableStock = product.stock - (product.locked_stock || 0);
        if (availableStock < item.quantity) {
          return res.status(400).json({
            message: `ສິນຄ້າ ${product.name} ບໍ່ພຽງພໍ. ເຫຼືອ: ${availableStock}, ຕ້ອງການ: ${item.quantity}`,
          });
        }

        // Lock stock
        await Product.findByIdAndUpdate(
          item.productId,
          {
            $inc: { locked_stock: item.quantity },
            expires_at: new Date(Date.now() + 3 * 60 * 1000),
          },
          { session }
        );
      }

      // 3. ตรวจสอบและอัปเดต Coupon Hold
      if (couponCode && couponHoldId) {
        const couponHold = await CouponHold.findOne({
          _id: couponHoldId,

          user_id: id,
          status: "active",
          expires_at: { $gte: new Date() },
        }).session(session);

        if (!couponHold) {
          return res.status(404).json({ message: "ໂຄ້ດສ່ວນຫຼຸດໝົດອາຍຸແລ້ວ" });
        }

        // อัปเดต hold expiry
        await CouponHold.findByIdAndUpdate(
          couponHoldId,
          {
            expires_at: new Date(Date.now() + 3 * 60 * 1000),
            status: "active",
          },
          { session }
        );
      }

      // 4. คำนวณค่าธรรมเนียมระบบ
      let totalFeeSystem = 0;
      const sellerFees = sellers.map((seller) => {
        const sellerTotal = selectedCartItems
          .filter(
            (item) => item.storeId.toString() === seller.sellerId.toString()
          )
          .reduce((sum, item) => sum + item.total, 0);

        const fee = sellerTotal * (seller.feeSystem / 100 || 0);
        totalFeeSystem += fee;

        return {
          sellerId: seller.sellerId,
          storeName: seller.storeName,
          sellerTotal,
          fee,
        };
      });

      const totalAfterFee = total - totalFeeSystem;

      // ✅ 5. สร้าง Payment QR Code

      const paymentData = {
        amount: total,
        description: "order",
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
        data: paymentData,
      };
      let response;
      try {
        response = await axios.request(config);
      } catch (err) {
        console.error(
          "❌ Generate QR Failed:",
          err.response?.data || err.message
        );
        throw new Error(err.response?.data?.detail || "Generate QR failed");
      }
      // 6. สร้าง Temporary Order
      const tempOrder = new Order({
        user_id: id,
        items: selectedCartItems,
        total,
        total_summary: totalAfterFee,
        fee_system: totalFeeSystem,
        seller_fees: sellerFees, // เพิ่มรายละเอียดค่า fee แต่ละ seller
        subtotal,
        discount,
        shippingAddress,
        shippingCost,
        qrcode: response.data.qrCode,
        coupon: applicableCoupon?._id || null,
        transactionId: response.data.transactionId,
        couponHold: couponHoldId || null,
        expires_at: new Date(Date.now() + 3 * 60 * 1000),
        status: "pending_payment",
        selectedItems: selectedItems,
        createdAt: new Date(),
      });

      await tempOrder.save({ session });

      // 7. Schedule cleanup job
      scheduleOrderCleanup(tempOrder._id, id, selectedCartItems, {
        _id: couponHoldId,
      });

      res.status(200).json({
        success: true,
        message: "ກະລຸນາຊຳລະເງິນພາຍໃນ 3 ນາທີ",
        id: tempOrder._id,
        transactionId: response.data.transactionId,
        qrCode: response.data.qrCode,
        total,
        subtotal,
        discount,
        fee_system: totalFeeSystem,
        total_summary: totalAfterFee,
      });
    });

    await session.commitTransaction();
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error("place_order error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error 500",
    });
  } finally {
    session.endSession();
  }
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

      // 1. Release locked stock for each item ວົນລູບລອກສະຕ໋ອກ
      for (const item of selectedCartItems) {
        await Product.findByIdAndUpdate(
          item.productId,
          {
            $inc: { locked_stock: -item.quantity },
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
        data: cached,
        source: "redis",
      });
    }

    // 2. Query DB  ຖ້າຕ້ອງການເພີ່ມຍອດນິຍົມ ກໍເພີມເຂົ້າໃນນີ້ JSON.parse(cached)
    const [featured, latest, topRating] = await Promise.all([
      Product.find({
        is_featured: true,
        access_products: "access",
        status: "available",
      })
        .populate("categoryId")
        .limit(10),
      Product.find({ access_products: "access", status: "available" })
        .populate("categoryId")
        .sort({ createdAt: -1 })
        .limit(10),
      Product.find({
        access_products: "access",
        status: "available",
      })
        .populate("categoryId")
        .sort({
          averageRating: -1,
        }) // ⭐ เรียงจากคะแนนสูงสุดลงต่ำสุด
        .limit(10), // เอาแค่ 10 อันดับ
    ]);

    const data = { featured, latest, topRating };

    // 3. เก็บ cache ไว้ 1 ชั่วโมง
    // await redis.set("home_products", JSON.stringify(data), "EX", 3600);
    await redis.set("home_products", JSON.stringify(data), {
      ex: 3600,
      nx: true,
    });
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
        data: cached,
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
    // await redis.set(`related_products:${id}`, JSON.stringify(data), "EX", 3600);
    await redis.set(`related_products:${id}`, JSON.stringify(data), {
      ex: 3600,
      nx: true,
    });
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
////

//////get_order
const get_order = async (req, res) => {
  try {
    const { id } = req;
    const orders = await Order.find({
      user_id: id,
      status: { $ne: "expired" },
    }).populate("items.productId");

    res.status(200).json({
      data: orders,
    });
  } catch (error) {
    console.error("get_order error:", error);
    res.status(500).json({ message: "server error 500" });
  }
};
const get_order_id = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate("items.productId");
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    res.status(200).json({
      data: order,
    });
  } catch (error) {
    console.error("get_order_id error:", error);
    res.status(500).json({ message: "server error 500" });
  }
};

/////reviews
// เพิ่มรีวิว
// Image upload helper
const uploadImage = async (file) => {
  try {
    // แปลง buffer เป็น base64
    const base64Data = `data:${file.mimetype};base64,${file.buffer.toString(
      "base64"
    )}`;

    // upload โดยใช้ data URI
    return await cloudinary.uploader.upload(base64Data, {
      folder: "ecommerce/image_reviews",
      resource_type: "image",
      transformation: [{ width: 500, height: 500, crop: "limit" }],
    });
  } catch (error) {
    console.error("❌ Cloudinary upload error:", error);
    throw new Error("Image upload failed");
  }
};

const add_reviews = async (req, res) => {
  try {
    const { productsId } = req.params;
    const { rating, reviewText } = req.body;
    const userId = req.id;
    const MAX_REVIEW_IMAGES = 2;
    const files = req.files;

    if (files.length > MAX_REVIEW_IMAGES) {
      return res.status(404).json({
        message: "ຮູບພາບເກີນກຳນົດ ສູງສຸດ 2ຮູບ",
      });
    }
    let reviewImages = [];
    if (files && files.length > 0) {
      const uploadPromises = files.map((file) => uploadImage(file));
      const uploadResults = await Promise.all(uploadPromises);
      reviewImages = uploadResults.map((r) => r.secure_url);
    }

    const review = new Review({
      product: productsId,
      user: userId,
      rating,
      reviewText,
      reviewImages,
    });

    await review.save();

    const product = await Product.findById(productsId);
    if (product) {
      const allReviews = await Review.find({ product: productsId });
      const avgRating =
        allReviews.reduce((acc, r) => acc + r.rating, 0) / allReviews.length;

      product.averageRating = avgRating;
      product.reviewCount = allReviews.length;
      await product.save();
    }
    await redis.del(`product:${productsId}`);
    const seller = await Seller.findOne({ user_id: product.user_id });
    ////ລວມຄ່າສະເລ່ຍຄະແນນທັງໝົດ
    const product_all = await Product.find({ user_id: product.user_id }).lean();
    const user_seller = await User.findById(product.user_id);
    let totalRating = 0;
    let totalReviews = 0;

    product_all.forEach((p) => {
      totalRating += (p.averageRating || 0) * (p.reviewCount || 0);
      totalReviews += p.reviewCount || 0;
    });

    const sellerAvgRating = totalReviews > 0 ? totalRating / totalReviews : 0;
    seller.sellerAvgRating = sellerAvgRating;
    user_seller.sellerAvgRating = sellerAvgRating;
    await seller.save();
    await user_seller.save();

    ///about redis
    await redis.set(
      `product:${productsId}`,
      JSON.stringify({ product, seller }),
      { ex: 3600, nx: true }
    );

    await redis.del(`related_products:${productsId}`);
    await redis.set(`related_products:${productsId}`, JSON.stringify(product), {
      ex: 3600,
      nx: true,
    });
    await redis.del(`get_reviews:${productsId}`);
    const reviews = await Review.find({ product: productsId })
      .populate("user", "username avatar") // เพิ่ม avatar ด้วยถ้ามี
      .sort({ createdAt: -1 });
    const avgRating = product?.averageRating || 0;
    const reviewCount = product?.reviewCount || 0;

    const data = {
      reviews,
      avgRating,
      reviewCount,
    };
    await redis.set(`get_reviews:${productsId}`, JSON.stringify(data), {
      ex: 3600,
      nx: true,
    });
    await refreshRedis_home();
    await refreshRedisProducts();

    res.status(200).json({ success: true, message: "ສຳເລັດ" });
  } catch (error) {
    console.error("add_reviews error:", error);
    res.status(500).json({ message: "server error 500" });
  }
};

// ดึงรีวิวของสินค้าตาม productsId
const get_reviews = async (req, res) => {
  try {
    const { productsId } = req.params;
    const cacheKey = `get_reviews:${productsId}`; // ✅ ใช้ key แยกตามสินค้า

    // 1️⃣ ตรวจสอบจาก Redis ก่อน
    const cachedReviews = await redis.get(cacheKey);
    if (cachedReviews) {
      console.log(`📌 Get reviews for ${productsId} from Redis`);
      return res.status(200).json({
        success: true,
        data: cachedReviews,
        source: "redis",
      });
    }

    // 2️⃣ ดึงจาก MongoDB
    const reviews = await Review.find({ product: productsId })
      .populate("user", "username avatar") // เพิ่ม avatar ด้วยถ้ามี
      .sort({ createdAt: -1 });

    // 3️⃣ คำนวณค่าเฉลี่ยและจำนวนรีวิว
    const product = await Product.findById(productsId);
    const avgRating = product?.averageRating || 0;
    const reviewCount = product?.reviewCount || 0;

    const data = {
      reviews,
      avgRating,
      reviewCount,
    };

    // 4️⃣ เก็บใน Redis (หมดอายุ 1 ชั่วโมง)
    await redis.set(cacheKey, JSON.stringify(data), {
      ex: 3600,
      nx: true,
    });

    res.status(200).json({
      success: true,
      data,
      source: "mongodb",
    });
  } catch (error) {
    console.error("get_reviews error:", error);
    res.status(500).json({ message: "server error 500" });
  }
};

module.exports = {
  get__products_id,
  cart,
  get_cart,
  update_quantity,
  place_order,
  get_coupon,
  discount,
  cancelCoupon,
  couponHold,
  get_temp_order,
  wishlist_add,
  get_wishlist,
  get_wishlist_all,
  delete_items,
  get_home_products,
  get_related_products,
  update_carts,
  createFlashSale,
  get_order,
  get_order_id,
  refreshRedisProducts,
  refreshRedis_home,
  get__products,
  onSubscribePaymentSupport,
  add_reviews,
  get_reviews,
};
