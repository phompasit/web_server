const { Schema, model } = require("mongoose");
const cartSchema = new Schema({
  userId: {
    type: Schema.ObjectId,
    ref: "User_models",
    required: true,
  },
  cart: [
    {
      sellerId: {
        type: Schema.ObjectId,
        ref: "sellers_models",
        required: true,
      },
      items: [
        {
          productId: {
            type: Schema.ObjectId,
            ref: "products_models",
            required: true,
          },
          quantity: Number,
          size: String,
          colors: String,
        },
      ],
    },
  ],
});

module.exports = model("Cart", cartSchema);
