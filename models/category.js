const { Schema, model } = require("mongoose");
const categorySchema = new Schema(
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
    images: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);
categorySchema.virtual("products_models", {
  ref: "products_models",
  localField: "_id",
  foreignField: "categoryId",
});

module.exports = model("Category_models", categorySchema);
