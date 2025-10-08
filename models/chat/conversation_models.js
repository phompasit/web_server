const { Schema, model } = require("mongoose");

const conversationSchema = new Schema(
  {
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User_models", // อ้างอิง User
        required: true,
      },
    ],
    type: {
      type: String,
      enum: ["buyer-seller", "admin-monitor"],
      default: "buyer-seller",
    },
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: "Message_models",
    },
  },
  { timestamps: true }
);

conversationSchema.virtual("messages", {
  ref: "Message_models", // model ที่เราจะ populate
  localField: "_id", // field ใน conversation
  foreignField: "conversationId", // field ใน message ที่เชื่อมกับ conversation
});

module.exports = model("Conversation_models", conversationSchema);
