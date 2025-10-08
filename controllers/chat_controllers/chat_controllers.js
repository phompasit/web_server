const Conversation = require("../../models/chat/conversation_models");
const Sellers = require("../../models/sellers");
// เปิดห้อง Buyer ↔ Seller
// controllers/chatController.js
const mongoose = require("mongoose");
const user = require("../../models/user");
const Message = require("../../models/chat/message_models");
// เปิดห้อง
const openConversation = async (req, res) => {
  try {
    const { sellerId } = req.body;
    const buyerId = req.id;

    let conversation = await Conversation.findOne({
      participants: { $all: [buyerId, sellerId] },
      type: "buyer-seller",
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [buyerId, sellerId],
        type: "buyer-seller",
      });
    }

    res
      .status(200)
      .json({ message: "Conversation opened", _id: conversation._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error opening conversation" });
  }
};

// ดึง conversation ของ user
const getConversation_all = async (req, res) => {
  try {
    const userId = req.id;

    const conversations = await Conversation.find({
      participants: userId,
      type: "buyer-seller",
    })
      .populate("participants", "_id role")
      .populate({ path: "lastMessage", select: "sender text createdAt" })
      .sort({ updatedAt: -1 });

    const data = await Promise.all(
      conversations.map(async (conv) => {
        const seller = conv.participants.find((p) => p.role === "sellers");
        const client = conv.participants.find((p) => p.role === "client");
        const conversationId = conv._id;
        const  unreadCount = await Message.countDocuments({
          conversationId,
          readBy: { $ne: userId },
        });
        let sellerdata = null;
        let clientdata = null;
        if (seller) sellerdata = await Sellers.findOne({ user_id: seller._id });
        if (client) clientdata = await user.findOne({ _id: client._id });

        return { ...conv.toObject(), sellerdata, clientdata,  unreadCount  };
      })
    );

    res.status(200).json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching conversations" });
  }
};

// ดึง message ของ conversation
const getConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId))
      return res.status(400).json({ message: "Invalid conversationId" });

    const messages = await Message.find({ conversationId })
      .populate("sender", "name email")
      .populate({
        path: "conversationId",
        populate: { path: "participants", select: "name email" },
      })
      .sort({ createdAt: 1 });

    res
      .status(200)
      .json({ message: "Messages fetched successfully", data: messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Something went wrong" });
  }
};

// ส่งข้อความ
const sendMessage = async (req, res) => {
  try {
    const { conversationId, text, attachments } = req.body;
    const userId = req.id;

    const newMessage = await Message.create({
      conversationId,
      sender: userId,
      text,
      attachments,
    });
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: newMessage._id,
    });

    const populatedMessage = await Message.findById(newMessage._id).populate(
      "sender",
      "name email"
    );

    res
      .status(201)
      .json({ message: "Message sent successfully", data: populatedMessage });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Something went wrong", error: err.message });
  }
};
const getUnreadCount = async (req, res) => {
  try {
    const { conversationId, userId } = req.query; // <-- ถ้าเป็น GET, ต้องเปลี่ยนเป็น req.query
    const countDocu = await Message.countDocuments({
      conversationId,
      readBy: { $ne: userId },
    });
    const data = {
      conversationId: conversationId,
      unreadCount: countDocu,
    };
    console.log("countDocu", countDocu);
    res.status(200).json({
      data: data,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  openConversation,
  getConversation,
  getConversation_all,
  sendMessage,
  getUnreadCount,
};
