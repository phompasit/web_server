const { Schema, model } = require("mongoose");
const balanceSchema = new Schema(
  {
    seller_id: {
      type: Schema.Types.ObjectId,
      ref: "User_models",
      required: true,
      unique: true, // 1 seller มี balance เดียว
    },
    withdrewIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "WithDrew",
      },
    ],
    balance: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = model("Balance", balanceSchema);
