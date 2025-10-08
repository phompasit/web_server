const { Schema, model } = require("mongoose");

const transactionSchema = new Schema(
  {
    seller_id: {
      type: Schema.Types.ObjectId,
      ref: "User_models",
      required: true,
    },
    order_id: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    subtotal: {
      type: Number,
      required: true,
    },
    fee_system: {
      type: Number,
      required: true,
    },
    total_summary: {
      type: Number, // เงินสุทธิที่ seller ได้
      required: true,
    },
    transaction_type: {
      type: String,
      enum: ["sale", "withdrawal"], // ✅ เพิ่มตรงนี้
      default: "sale",
    },
    status: {
      type: String,
      enum: ["pending_payout", "completed", "withdrawn"],
      default: "pending_payout",
    },
  },
  { timestamps: true }
);

module.exports = model("Transaction", transactionSchema);
