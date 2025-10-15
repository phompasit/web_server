const { Schema, model } = require("mongoose");
const ReviewSchema = new Schema(
  {
    product: {
      type: Schema.ObjectId,
      ref: "products_models",
      required: true,
    },
    user: {
      type: Schema.ObjectId,
      ref: "User_models",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    reviewText: {
      type: String,
      trim: true,
      required: true,
    },
    reviewImages: [
      {
        type: String, // เก็บ path หรือ url ของรูปภาพ
      },
    ],
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"], // ถ้าต้องการ moderation
      default: "approved",
    },
  },
  { timestamps: true } // auto สร้าง createdAt และ updatedAt
);

// Index ช่วยค้นหารีวิวของสินค้าเร็วขึ้น
ReviewSchema.index({ product: 1, user: 1 });


module.exports = model("Review", ReviewSchema);
