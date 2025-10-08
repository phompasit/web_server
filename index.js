require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const methodOverride = require("method-override");
const http = require("http");
const server = http.createServer(app);
const CouponHold = require("./models/couponHold");
const webpush = require("web-push");
const Coupon = require("./models/coupons");
const helmet = require("helmet");
const PORT = process.env.PORT || 5000;
const finance_route = require("./routes/finance_route/routes");
// ⬇️ เพิ่มส่วนนี้
const { io, userSocketMap } = require("./socket/socket")(server);
// แก้ controller ให้ใช้ io และ userSocket
app.set("io", io);
app.set("userSocketMap", userSocketMap);
const subscriptions = [];
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
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));
app.use(methodOverride("_method"));
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "wss:"], // socket.io
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
    },
  })
);
const allowedOrigins = ["http://localhost:5173", "http://localhost:5174"];
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow non-browser requests
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
// Save subscription (ส่งมาจาก React)
app.post("/api/save-subscription", (req, res) => {
  subscriptions.push(req.body);
  console.log(req.body);
  res.status(201).json({ message: "Subscription saved" });
});
app.use(express.json()); // รับ JSON จาก Gateway
app.get("/health", (req, res) => res.send("Server is up!"));
// Routes
app.use("/api/auth", auth_routes);
app.use("/api/admin", admin_routes);
app.use("/api/sellers", seller_routes);
app.use("/api/client", client_routes);
app.use("/api/chat", chat_route);
app.use("/api/finance", finance_route);

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
      console.log(`คืน quota และลบ hold ${expiredHolds.length} รายการ`);
    }
  } catch (err) {
    console.error("cleanExpiredHolds error", err);
  }
};

setInterval(cleanExpiredHolds, 10 * 10000); // ตรวจทุก 10 วิ

// Start Server
const startServer = async () => {
  try {
    await connectDB(process.env.MONGODB_URL);
    server.listen(PORT, () => {
      onSubscribePaymentSupport(io);
      console.log(`🚀 Server + Socket.IO running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Connection error:", error);
    process.exit(1);
  }
};

startServer();
