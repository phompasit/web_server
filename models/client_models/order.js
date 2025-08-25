const { Schema, model } = require("mongoose");
const orderSchema = new Schema({
  user_id: {
    type: Schema.ObjectId,
    ref: "User_models",
    required: true,
  },
  items: [
    {
      productId: {
        type: Schema.ObjectId,
        ref: "products_models",
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
        min: 1,
      },
      price: {
        type: Number,
        required: true,
      },
    },
  ],
  total: {
    type: Number,
    required: true,
  },
  subtotal: {
    type: Number,
    required: true,
  },
  discount: {
    type: Number,
    default: 0,
  },
  shippingCost: {
    type: Number,
    default: 0,
  },
  coupon: {
    type: Schema.ObjectId,
    ref: "Coupons_models",
  },
  couponHold: {
    type: Schema.ObjectId,
    ref: "CouponHold_models",
  },
  expires_at: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 }, // MongoDB TTL index
  },
  status: {
    type: String,
    enum: ["pending_payment", "completed", "expired"],
    default: "pending_payment",
  },
  final_order_id: {
    type: Schema.ObjectId,
    ref: "Order_models",
  },
  paymentMethod: { type: String, default: "BCEL" }, // หรือ BCEL/NiZPay
  subscriptionId: { type: String }, // ถ้าเป็น recurring
});

module.exports = model("Order", orderSchema);
