const express = require("express");
const {
  send_otp,
  verifyOtp,
  get_otp,
  resetPassword,
} = require("../../sms/provider");
const router = express.Router();

router.post("/send_otp", send_otp);
router.post("/verifyOtp", verifyOtp);
router.get("/get_otp/:phone", get_otp);
router.post("/reset_password", resetPassword);
module.exports = router;
