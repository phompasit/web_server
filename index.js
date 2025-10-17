require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const methodOverride = require("method-override");
const http = require("http");
const server = http.createServer(app);
const CouponHold = require("./models/couponHold");
const webpush = require("web-push");
const Coupon = require("./models/coupons");
const helmet = require("helmet");

const finance_route = require("./routes/finance_route/routes");

// ⬇️ เพิ่มส่วนนี้
const sms_route = require("./routes/sms_route/route");
const { io, userSocketMap } = require("./socket/socket")(server);

// แก้ controller ให้ใช้ io และ userSocket
app.set("io", io);
app.set("userSocketMap", userSocketMap);
const vapidKeys = {
  publicKey:
    "BIUKEi_nBWz-EyGmjiExpicXPxPWSG2SsTutdFFJxMmgqK8Lg3_KWjF1cRIOAReWfx76J4ga34Al1FA5RQpOzxg", // <<< ใส่ Public Key ที่ generate
  privateKey: "89zIEI0Bk3dGSlVt4_yRW2Vw1O1ZrXNfCQ-uVrRhWPI", // <<< ใส่ Private Key ที่ generate
};

webpush.setVapidDetails(
  "mailto:your-email@example.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey
);
const connectDB = require("./config/db");
const auth_routes = require("./routes/auth_route/route");
const admin_routes = require("./routes/admin_route/routes");
const seller_routes = require("./routes/seller_routes/route");
const client_routes = require("./routes/client_routes/routes");
const chat_route = require("./routes/chat_route/routes");
const {
  onSubscribePaymentSupport,
} = require("./controllers/client_controllers/products");
// Middleware
// ✅ Middleware
app.use(
  cors({
    origin: function (origin, callback) {
      // const allowedOrigins = [
      //   "http://localhost:5173",
      //   "http://localhost:5174",
      //   "https://admin-seller-ecomerce-myshop.pages.dev",
      // ];
       const allowedOrigins = ["https://admin-seller-ecomerce-myshop.pages.dev"]
      // const allowedOrigins = ["*"];
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(helmet());
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(methodOverride("_method"));

app.get("/health-check", (req, res) => res.status(200).send("OK"));
///
app.get("/", (req, res) => {
  res.status(200).send("Server is running ✅");
});
// Routes
app.use("/api/auth", auth_routes);
app.use("/api/admin", admin_routes);
app.use("/api/sellers", seller_routes);
app.use("/api/client", client_routes);
app.use("/api/chat", chat_route);
app.use("/api/finance", finance_route);
app.use("/api/sms", sms_route);

const cleanExpiredHolds = async () => {
  try {
    const now = new Date();
    const expiredHolds = await CouponHold.find({
      status: "active",
      expires_at: { $lte: now },
    });

    if (expiredHolds.length > 0) {
      for (const hold of expiredHolds) {
        // คืน quota ให้ coupon
        await Coupon.updateOne(
          { _id: hold.coupon_id },
          { $inc: { used_count: -1 } }
        );

        // ลบ hold ออก
        await CouponHold.deleteOne({ _id: hold._id });
      }
      console.log(`ຄືນ quota ແລະລົບ hold ${expiredHolds.length} ລາຍການ`);
    }
  } catch (err) {
    console.error("cleanExpiredHolds error", err);
  }
};

setInterval(cleanExpiredHolds, 10 * 10000); // ตรวจทุก 10 วิ

// Start Server
const startServer = async () => {
  try {
    const port = process.env.PORT || 5000;
    await connectDB(process.env.MONGODB_URL);
    server.listen(port, "0.0.0.0", () => {
      onSubscribePaymentSupport(io);
      console.log(`🚀 Server + Socket.IO running on port ${port}`);
    });
  } catch (error) {
    console.error("❌ Connection error:", error);
    process.exit(1);
  }
};
// Error handling

startServer();
