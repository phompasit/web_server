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
const app = express();
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
    const [featured, latest] = await Promise.all([
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
    };

    // เก็บ cache 1 ชั่วโมง
    await redis.set("home_products", JSON.stringify(data), {
      ex: 3600,
      nx: true,
    });
    console.log("📌 Refresh home_products success");

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
        data: JSON.parse(cachedProducts),
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

          console.log("Data received:", data);

          const find_order = await Order.findOne({
            transactionId: data.transactionId,
          }).session(session);

          if (!find_order) {
            await session.abortTransaction();
            session.endSession();
            console.log(
              "❌ Order not found for transaction:",
              data.transactionId
            );
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
              payment_time: data.txnDateTime,
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
        data: JSON.parse(cachedData),
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
      selectedItems,
      shippingAddress,
    } = req.body;
    await session.withTransaction(async () => {
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

      const response = await axios.request(config);
      //       // 1. Lock stock for each selected cart item
      for (const item of selectedCartItems) {
        const product = await Product.findById(item.productId).session(session);
        if (!product) {
          throw new Error(`Product ${item.productId} not found`);
        }
        //         // Check if enough stock is available (considering already locked stock)
        const availableStock = product.stock - (product.locked_stock || 0);
        if (availableStock < item.quantity) {
          throw new Error(
            `Insufficient stock for product ${product.name}. Available: ${availableStock}, Requested: ${item.quantity}`
          );
        }
        //         // Lock the stock
        await Product.findByIdAndUpdate(
          item.productId,
          {
            $inc: { locked_stock: item.quantity },
            expires_at: new Date(Date.now() + 3 * 60 * 1000), // 10 minutes from now
          },
          { session }
        );
      }
      //       // 2. Create/Update coupon hold with 10 minutes expiry
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
      //       // 3. Create temporary order record
      let userId = null;
      for (item of selectedCartItems) {
        const products = await Product.findById(item.productId);
        if (!products) {
          throw new Error(`Product ${item.productId} not found`);
        }
        userId = products.user_id;
      }
      const seller = await Seller.findOne({ user_id: userId });
      const calculate_feeSystem = total * (seller.fee_system / 100 || 0);
      // NOTE: TempOrder_models is not imported in your code. You should import it at the top.
      //       ///ເຊື່ອມຕໍ່ສ້າງ ຄິວອາຈາກ phapay

      const tempOrder = new Order({
        user_id: id,
        items: selectedCartItems,
        total,
        total_summary: total - calculate_feeSystem,
        fee_system: calculate_feeSystem,
        subtotal,
        discount,
        shippingAddress,
        shippingCost,
        qrcode: response.data.qrCode,
        coupon: coupon?._id,
        transactionId: response.data.transactionId,
        couponHold: couponHold?._id,
        expires_at: new Date(Date.now() + 3 * 60 * 1000), // 10 minutes
        status: "pending_payment",
        selectedItems: selectedItems,
      });
      // 2️⃣ เตรียม payload สำหรับธนาคาร (เช่น 2C2P)
      await tempOrder.save({ session });

      res.status(200).json({
        message:
          "Order placed successfully, please complete payment within 10 minutes",
        id: tempOrder._id,
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

// // Function to schedule cleanup
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
        data: JSON.stringify(cached) ,
        source: "redis",
      });
    }

    // 2. Query DB  ຖ້າຕ້ອງການເພີ່ມຍອດນິຍົມ ກໍເພີມເຂົ້າໃນນີ້ JSON.parse(cached)
    const [featured, latest] = await Promise.all([
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
    ]);

    const data = { featured, latest };

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
  delete_cart_item_products,
  delete_items,
  get_home_products,
  get_related_products,
  update_carts,
  createFlashSale,
  check_out_payment,
  get_order,
  get_order_id,
  refreshRedisProducts,
  refreshRedis_home,
  get__products,
  onSubscribePaymentSupport,
};
