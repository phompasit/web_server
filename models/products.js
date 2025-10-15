const { Schema, model } = require("mongoose");
const sellerSchema = new Schema(
  {
    user_id: {
      type: Schema.ObjectId,
      ref: "User_models",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    brand: {
      type: String,
      trim: true,
    },
    sku: {
      type: String,
      unique: true,
      sparse: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    discount_price: {
      type: Number,
      min: 0,
    },
    size: {
      type: [String],
      required: true,
    },
    colors: {
      type: [String],
      required: true,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
    },
    sold_count: {
      type: Number,
      default: 0,
    },
    categoryId: {
      type: Schema.ObjectId,
      ref: "Category_models",
    },
    images: {
      type: [String],
      required: true,
    },
    is_featured: {
      type: Boolean,
      default: false,
    },
    locked_stock: {
      type: Number,
    },

    expires_at: { type: Date }, // TTL index
    shipping_info: {
      weight: { type: Number, default: 0 }, // kg
      dimensions: {
        length: Number,
        width: Number,
        height: Number,
      },
      shipping_fee: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: [
        "available",
        "out_of_stock",
        "discontinued",
        "temporarily_unavailable",
      ],
      default: "available",
    },
    low_stock_threshold: {
      type: Number,
      default: 5,
      min: 0,
    },
    access_products: {
      ////อานุมัดขาย
      type: String,
      enum: ["access", "process", "rejected"],
      default: "process",
    },
    sanitizedReason: {
      type: String,
    },
    orginalPrice: {
      type: Number,
      min: 0,
    },
    //averageRating
    averageRating:{
      type: Number,
      min: 0,
    },
    reviewCount:{
         type: Number,
      min: 0,
    }
  },
  { timestamps: true }
);
sellerSchema.virtual("Coupons_models", {
  ref: "Coupons_models",
  localField: "_id",
  foreignField: "applicable_products",
});
sellerSchema.virtual("Cart", {
  ref: "Cart",
  localField: "_id",
  foreignField: "cart.items.productId",
});
sellerSchema.virtual("Order", {
  ref: "Order",
  localField: "_id",
  foreignField: "items.productId",
});
sellerSchema.virtual("Wishlist", {
  ref: "Wishlist",
  localField: "_id",
  foreignField: "productId",
});
sellerSchema.virtual("falsh_sales", {
  ref: "falsh_sales",
  localField: "_id",
  foreignField: "productId",
});

sellerSchema.virtual("falsh_sales", {
  ref: "falsh_sales",
  localField: "_id",
  foreignField: "product",
});
sellerSchema.virtual("Review", {
  ref: "Review",
  localField: "_id",
  foreignField: "user",
});
module.exports = model("products_models", sellerSchema);
