const mongoose = require("mongoose");

const couponHoldSchema = new mongoose.Schema({
  coupon_id: { type: mongoose.Schema.Types.ObjectId, ref: "Coupons_models" },
  user_id: mongoose.Schema.Types.ObjectId,
  created_at: { type: Date, default: Date.now },
  expires_at: { type: Date, required: true }, // TTL index
  status: {
    type: String,
    enum: ["active", "converted", "expired", "cancelled"],
    default: "active",
  },
});

// TTL index (auto delete when expires)
couponHoldSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
couponHoldSchema.index({ coupon_id: 1, status: 1 });

module.exports = mongoose.model("CouponHold", couponHoldSchema);
