const { Schema, model } = require("mongoose");

const notificationSchema = new Schema(
  {
    order_id: { 
      type: Schema.Types.ObjectId, 
      ref: "Order", // สมมุติว่าเรามี collection Order
      required: true 
    },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User_models", // ใครที่จะได้รับ notification
      required: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    isRead: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true } // จะมี createdAt และ updatedAt ให้อัตโนมัติ
);

module.exports = model("Notification", notificationSchema);
