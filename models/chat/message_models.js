const { Schema, model } = require("mongoose");

const messageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation_models",
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User_models",
      required: true,
    },
    text: {
      type: String,
    },
    attachments: [
      {
        url: String,       // link ไฟล์/รูป
        type: String,      // image, file, video
      },
    ],
    readBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User_models",
      },
    ],
  },
  { timestamps: true }
);

module.exports = model("Message_models", messageSchema);
