const { Schema, model } = require("mongoose");
const couponsSchema = new Schema(
  {
    user_id: {
      type: Schema.ObjectId,
      ref: "User_models",
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    coupon_code: {
      type: String,
      required: true,
      trim: true,
    },
    discount_type: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true,
    },

    discount_value: {
      type: Number,
      required: true,
      min: 0,
    },
    start_date: {
      type: Date,
      required: true,
    },
    end_date: {
      type: Date,
      required: true,
    },
    min_order_amount: {
      type: Number,
      default: 0,
    },
    max_discount_amount: {
      type: Number,
      default: 0,
    },
    usage_limit: {
      type: Number,
      default: 0,
    },
    used_count: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "expired"],
      default: "active",
    },
    applicable_products: [
      {
        type: Schema.ObjectId,
        ref: "products_models",
      },
    ],
    applicable_stores: [
      {
        type: Schema.ObjectId,
        ref: "User_models",
      },
    ],
    applicable_type: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);
couponsSchema.virtual("CouponHold", {
  ref: "CouponHold",
  localField: "_id",
  foreignField: "coupon_id",
});
module.exports = model("Coupons_models", couponsSchema);
