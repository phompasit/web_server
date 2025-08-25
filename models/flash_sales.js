const { Schema, model } = require("mongoose");
const falsh_salesSchema = new Schema(
  {
    user_id: {
      type: Schema.ObjectId,
      ref: "User_models",
      required: true,
    },
    productId: {
      type: Schema.ObjectId,
      ref: "products_models",
      required: true,
    },
    discountPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true }
);
module.exports = model("falsh_sales", falsh_salesSchema);
