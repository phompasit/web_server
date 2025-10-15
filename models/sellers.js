const { Schema, model } = require("mongoose");
const sellerSchema = new Schema(
  {
    user_id: {
      type: Schema.ObjectId,
      ref: "User_models",
      required: true,
    },
    fee_system: {
      type: Number,
    },

    vat: {
      type: Number,
    },
    store_code: {
      type: String,
    },
    store_images: {
      type: String,
    },
    store_name: {
      type: String,
    },
    address: {
      type: String,
    },
    description: {
      type: String,
    },
    status: {
      type: String,
    },
    bank_account_name: {
      type: String,
    },
    bank_account_number: {
      type: Number,
    },
    bank_account_images: {
      type: String,
    },
    isSubmitted: {
      type: Boolean,
      default: false,
    },
    bank_name: {
      type: String,
      default: "ธนาคารกรุงเทพ",
    },
    ///verify
    idCardImage: {
      type: String,
    },
    selfieImage: {
      type: String,
    },
    verificationStatus: {
      type: String,
      enum: ["pending", "access", "rejected"],
      default: "pending",
    },
    verificationData: {
      fullName: { type: String },
      idNumber: { type: String },
      documentType: { type: String, enum: ["id_card", "passport"] },
      birthDate: { type: Date },
      expiryDate: { type: Date },
      address: { type: String },
    },
    rejectionReason: {
      type: String, // เก็บข้อความจากแอดมินว่าทำไมถึง reject
    },
    followers: [
      {
        userId: {
          type: Schema.ObjectId,
          ref: "User_models",
        },
        followedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    totalFollowers: {
      type: Number,
      default: 0,
    },
     sellerAvgRating: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true, toObject: { virtuals: true }, toJSON: { virtuals: true } }
);
sellerSchema.virtual("carts", {
  ref: "Cart", // ชื่อโมเดล Cart ที่คุณใช้ใน model("Cart", ...)
  localField: "_id", // เชื่อมจาก seller._id
  foreignField: "cart.sellerId", // เชื่อมกับ cart.sellerId (ซึ่งอยู่ใน array ซ้อน)
});
sellerSchema.virtual("Order", {
  ref: "Order", // ชื่อโมเดล Cart ที่คุณใช้ใน model("Cart", ...)
  localField: "_id", // เชื่อมจาก seller._id
  foreignField: "items.sellerId", // เชื่อมกับ cart.sellerId (ซึ่งอยู่ใน array ซ้อน)
});
sellerSchema.virtual("Balance", {
  ref: "Balance", // ชื่อโมเดล Cart ที่คุณใช้ใน model("Cart", ...)
  localField: "_id", // เชื่อมจาก seller._id
  foreignField: "seller_id", // เชื่อมกับ cart.sellerId (ซึ่งอยู่ใน array ซ้อน)
});
module.exports = model("sellers_models", sellerSchema);
