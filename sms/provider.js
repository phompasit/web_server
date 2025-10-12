const User = require("../models/user");
const twilio = require("twilio");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const client = new twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
// สร้าง reset token ชั่วคราว
const generateResetToken = async (userId) => {
  const token = uuidv4(); // สร้าง UUID random
  const expires = Date.now() + 15 * 60 * 1000; // หมดอายุ 15 นาที

  // บันทึก token + เวลาใน DB
  await User.findByIdAndUpdate(userId, {
    resetuuid: token,
    resetuuidExpires: expires,
  });

  return token;
};
const send_otp = async (req, res) => {
  try {
    let { phone } = req.body;

    // ตรวจสอบและบังคับให้เป็น string
    phone = String(phone);

    // ตรวจสอบว่ามีผู้ใช้ในระบบไหม
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ message: "ເບີນີ້ບໍ່ຢູ່ໃນລະບົບ" });
    }
    // รีเซ็ตจำนวนถ้าเกิน 15 นาที
    const now = Date.now();
    const windowTime = 15 * 60 * 1000; // 15 นาที
    const maxCount = 3; // ส่งได้สูงสุด 3 ครั้ง / 15 นาที
    if (!user.otpLastSent || now - user.otpLastSent > windowTime) {
      user.otpSendCount = 0;
    }
    if (user.otpSendCount >= maxCount) {
      return res
        .status(429)
        .json({ message: "ສົ່ງ OTP ເກີນ 3 ຄັ້ງກະລຸນາລອງໃໝ່ໃນພາຍຫຼັງ" });
    }

    // สร้าง OTP (6 หลัก)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const uuid = await generateResetToken(user._id);
    // บันทึกลงฐานข้อมูล
    user.sms_code = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000; // 5 นาที
    user.otpSendCount += 1;
    user.otpLastSent = now;
    user.uuid = uuid;
    await user.save();
    await client.messages.create({
      body: `ລະຫັດ OTP ຂອງທ່ານແມ່ນ ${otp} (ມີອາຍຸ 5 ນາທີ)`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: `+856${phone}`, // เบอร์ปลายทาง (ลาวใช้ +856)
    });
    res.json({
      success: true,
      message: "ສົ່ງ OTP ສຳເລັດ",
      phone: phone,
      uuid: uuid,
    });
  } catch (error) {
    console.error("Send OTP Error:", error);
    res.status(500).json({ message: "ສົ່ງ OTP ບໍ່ສຳເລັດ", error });
  }
};
// GET /api/auth/get-otp/:phone
const get_otp = async (req, res) => {
  try {
    const { phone } = req.params; // แก้ req.parmse -> req.params
    const user = await User.findOne({ phone }).select("otpExpires -_id uuid");

    if (!user) {
      return res.status(404).json({ message: "ບໍ່ພົບຜູ້ໃຊ້" });
    }
    console.log(user);
    res.status(200).json({
      success: true,
      otpExpires: user?.otpExpires,
      resetuuid: user?.uuid,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Error", error });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    console.log(phone, otp);
    // 🔹 หา user จากเบอร์โทร
    const user = await User.findOne({ phone }).lean();

    if (!user) {
      return res.status(404).json({ success: false, message: "ບໍ່ພົບຜູ້ໃຊ້" });
    }

    // 🔹 ตรวจว่า user มีรหัส otp และเวลาหมดอายุหรือไม่
    if (!user.sms_code || !user.otpExpires) {
      return res.status(400).json({
        success: false,
        message: "ບໍ່ມີຂໍ້ມູນ OTP ຫຼື OTP ໝົດອາຍຸແລ້ວ",
      });
    }

    // 🔹 ตรวจสอบว่า OTP หมดอายุหรือยัง
    const now = new Date();
    const expireTime = new Date(user.otpExpires);

    if (now > expireTime) {
      return res.status(400).json({
        success: false,
        message: "OTP ໝົດອາຍຸແລ້ວ",
      });
    }

    // 🔹 ตรวจสอบ OTP
    if (user.sms_code !== Number(otp)) {
      return res.status(400).json({
        success: false,
        message: "OTP ບໍ່ຖືກຕ້ອງ",
      });
    }

    // ✅ ผ่านการตรวจสอบ OTP แล้ว
    // สามารถให้สิทธิ reset password หรือออก token ก็ได้
    res.json({
      success: true,
      phone: phone,
      otp: otp,
      message: "OTP ຖືກຕ້ອງ ສາມາດ reset password ໄດ້ແລ້ວ",
    });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    res.status(500).json({
      success: false,
      message: "ການຢືນຢັນ OTP ລົ້ມເຫຼວ",
      error: error.message,
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { phone, otp, password } = req.body;
    console.log(phone, otp, password);
    if (!password) {
      return res
        .status(400)
        .json({ success: false, message: "ກະລຸນາກອກຂໍ້ມູນໃຫ້ຄົບ" });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "ບໍ່ພົບຜູ້ໃຊ້ນີ້" });
    }

    // 🔹 ตรวจสอบ OTP หมดอายุ
    const now = new Date();
    if (!user.otpExpires || now > new Date(user.otpExpires)) {
      return res
        .status(400)
        .json({ success: false, message: "OTP ໝົດອາຍຸແລ້ວ" });
    }

    // 🔹 ตรวจสอบ OTP ถูกต้องไหม
    if (user.sms_code !== Number(otp)) {
      return res
        .status(400)
        .json({ success: false, message: "OTP ບໍ່ຖືກຕ້ອງ" });
    }

    // 🔹 เข้ารหัสรหัสผ่านใหม่
    const hashedPassword = await bcrypt.hash(password, 10);

    // 🔹 อัปเดตรหัสผ่านและล้าง OTP
    user.password = hashedPassword;
    user.sms_code = null;
    user.sms_expire_at = null;
    user.otpSendCount = null;
    user.otpLastSent = null;
    await user.save();

    res.status(200).json({ success: true, message: "ຕັ້ງລະຫັດໃໝ່ສຳເລັດແລ້ວ" });
  } catch (error) {
    console.error("Reset password error:", error);
    res
      .status(500)
      .json({ success: false, message: "ບໍ່ສາມາດຕັ້ງລະຫັດໃໝ່ໄດ້", error });
  }
};

module.exports = {
  send_otp,
  verifyOtp,
  resetPassword,
  get_otp,
};
