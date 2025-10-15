const JWT = require("jsonwebtoken");
const User = require("../models/user");
const rateLimit = require("express-rate-limit");
const authMiddlewares = async (req, res, next) => {
  try {
    const { accessToken } = req?.cookies;

    if (!accessToken) {
      return res.status(401).json({
        success: false,
        authenticated: false,
        message: "ກະລຸນາເຂົ້າສູ່ລະບົບກ່ອນ",
      });
    }

    // Verify JWT token
    const decode = JWT.verify(accessToken, process.env.TOKEN_SECRET);

    // Find user in database
    const user = await User.findById(decode._id);
    if (!user) {
      return res.status(401).json({
        success: false,
        authenticated: false,
        message: "Session expired. Please login again.",
      });
    }

    // Attach user info to request object
    req.role = decode.role;
    req.id = decode._id;
    req.user = {
      _id: user._id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      role: user.role,
      active: user.active,
      // เพิ่ม fields อื่นๆ ที่ต้องการ
    };
    req.token = accessToken; // แก้ไข syntax error

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        authenticated: false,
        message: "Invalid token",
      });
    } else if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        authenticated: false,
        message: "Token expired",
      });
    }

    return res.status(500).json({
      success: false,
      authenticated: false,
      message: "Server error during authentication",
    });
  }
};

const registerLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 นาที
  max: 5,
  message: "ທ່ານພະຍາຍາມເກີນກວ່າ 5 ຄັ້ງ ກະລຸນາລອງໃໝ່ອີກຄັ້ງຫຼັງຈາກຜ່ານໄປ 1 ນາທີ",
  standardHeaders: true,
  legacyHeaders: false,
});

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource",
      });
    }
    next();
  };
};

module.exports.authorizeRoles = authorizeRoles;
module.exports.authMiddlewares = authMiddlewares;
module.exports.registerLimiter = registerLimiter;
