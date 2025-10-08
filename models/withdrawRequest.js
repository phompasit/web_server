const { Schema, model } = require("mongoose");
const withDrewSchema = new Schema(
  {
    seller_id: {
      type: Schema.Types.ObjectId,
      ref: "User_models",
      required: true,
      unique: true, // 1 seller มี balance เดียว
    },
    amount: {
      type: Number,
      default: 0,
    },
    note: {
      type: String,
    },
    status: {
      type: String,
      enum: ["pending", "success", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);
withDrewSchema.virtual("Balance", {
  ref: "Balance",
  localField: "_id",
  foreignField: "withdrewId",
});
module.exports = model("WithDrew", withDrewSchema);
