const mongoose = require("mongoose");

const wishlistSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User_models",
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "products_models",
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
    note: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// ป้องกัน duplicate (1 user มีสินค้าชิ้นเดียวกันใน wishlist แค่ครั้งเดียว)
wishlistSchema.index({ user: 1, product: 1 }, { unique: true });

module.exports = mongoose.model("Wishlist", wishlistSchema);
