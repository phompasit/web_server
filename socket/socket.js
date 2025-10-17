const conversation_models = require("../models/chat/conversation_models");
const Message = require("../models/chat/message_models");
const { Server } = require("socket.io");
const Sellers = require("../models/sellers");
const user = require("../models/user");
const userSocketMap = new Map(); // ✅ ใช้ Map
const mongoose = require("mongoose");
const SubscriptionModel = require("../models/SubscriptionModel");
const webpush = require("web-push");
const sendPushNotification = async (subscription, payload, userId) => {
  try {
    await webpush.sendNotification(subscription, payload);
    console.log("✅ Push sent to", userId);
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      console.log(
        `❌ Subscription expired for user ${userId}, removing from DB`
      );
      await SubscriptionModel.deleteOne({ userId });
    } else {
      console.error("Push error:", err);
    }
  }
};

function initializeSocket(server) {
  const io = require("socket.io")(server, {
    cors: {
      origin: function (origin, callback) {
        const allowedOrigins = [
          "http://localhost:5173",
          "http://localhost:5174",
          "https://admin-seller-ecomerce-myshop.pages.dev",
        ];

        if (!origin || allowedOrigins.includes(origin)) callback(null, true);
        else callback(new Error("Not allowed by CORS"));
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });
  //////
  io.on("connect", (socket) => {
    console.log("🟢 Socket connected:", socket.id);

    // user join room
    socket.on("joinRoom", (conversationId, userId) => {
      socket.join(conversationId);
      console.log(`User ${socket.id} joined room ${conversationId}`);
      // ✅ ส่งสถานะออนไลน์ของคนในห้องกลับไป
      // เก็บ userId ลงใน socket.data
      socket.data.userId = userId;
      // ดึง userId ของทุก socket ในห้อง
      const clientsInRoom = [
        ...(io.sockets.adapter.rooms.get(conversationId) || []),
      ];
      const onlineUsers = clientsInRoom.map(
        (id) => io.sockets.sockets.get(id)?.data.userId
      );
      // ส่ง list userId กลับไป
      io.to(conversationId).emit("roomOnlineUsers", onlineUsers);
    });
    // ✅ ให้ user join ห้องของตัวเองตาม userId
    socket.on("registerUser", (userId) => {
      socket.join(userId.toString());
      userSocketMap.set(userId, socket.id);
      console.log(`📌 User ${userId} joined personal room`);
    });
    //ดึงข้อมูล หัวข้อ conversation
    socket.on("conversation_all", async ({ userId }, callback) => {
      try {
        const conversations = await conversation_models
          .find({
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
            const unreadCount = await Message.countDocuments({
              conversationId,
              readBy: { $ne: userId },
            });
            let sellerdata = null;
            let clientdata = null;
            if (seller)
              sellerdata = await Sellers.findOne({ user_id: seller._id });
            if (client) clientdata = await user.findOne({ _id: client._id });

            return { ...conv.toObject(), sellerdata, clientdata, unreadCount };
          })
        );
        // ส่งข้อมูลกลับ client
        callback({ status: "ok", data });
      } catch (error) {
        console.error("❌ getConversation error:", error);
        callback({ status: "error", message: "Server error" });
      }
    });
    // ดึงข้อมูล messages
    socket.on("getConversation", async ({ conversationId }, callback) => {
      try {
        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId))
          return callback({
            status: "error",
            message: "Invalid conversationId",
          });
        console.log("✅ markAsRead event received:", { conversationId });
        const messages = await Message.find({ conversationId })
          .populate("sender", "name email")
          .sort({ createdAt: 1 });
        // ส่งข้อมูลกลับ client
        console.log("ok conversation");
        callback({ status: "ok", messages });
      } catch (error) {
        console.error("❌ getConversation error:", error);
        callback({ status: "error", message: "Server error" });
      }
    });
    ///ສົ່ງຂໍ້ຄວາມ
    socket.on(
      "sendMessage",
      async ({ conversationId, sender, text, attachments, tempMessageId }) => {
        try {
          const newMessage = await Message.create({
            conversationId,
            sender,
            text,
            attachments,
            readBy: [sender],
          });

          await conversation_models.findByIdAndUpdate(conversationId, {
            lastMessage: newMessage._id,
          });
          const populatedMessage = await Message.findById(newMessage._id);

          const conversation = await conversation_models
            .findById(conversationId)
            .populate("participants");
          if (!conversation) return;

          const recipient = conversation.participants.find(
            (u) => u._id.toString() !== sender.toString()
          );
          if (recipient) {
            const subscriptionData = await SubscriptionModel.findOne({
              userId: recipient._id,
            });
            if (subscriptionData) {
              const payload = JSON.stringify({
                title: "ຂໍ້ຄວາມໃໝ່",
                body: populatedMessage.text,
                url: `http://localhost:5174`,
              });
              await sendPushNotification(
                subscriptionData.subscription,
                payload,
                recipient._id
              );
            }
            // นับ unread ใหม่
            const unreadCount = await Message.countDocuments({
              conversationId,
              readBy: { $ne: recipient._id },
            });
            console.log("Unread count for recipient:", unreadCount);
            // emit ให้ recipient update badge
            io.to(recipient._id.toString()).emit(
              "updateUnreadCount",
              unreadCount
            );
          }
          io.to(conversationId).emit("newMessage", {
            ...populatedMessage.toObject(),
            tempMessageId,
          });
        } catch (err) {
          console.error("Socket sendMessage error:", err);
        }
      }
    );
    ////ກວດສອບໄອດີຄົນເຂົ້າມາອ່ານ
    socket.on("markAsRead", async ({ conversationId, userId }, callback) => {
      try {
        await Message.updateMany(
          { conversationId, readBy: { $ne: userId } },
          { $push: { readBy: userId } }
        );

        const updatedMessages = await Message.find({ conversationId });

        // ส่งกลับ client ที่อยู่ใน room
        io.to(conversationId).emit("markAsRead", updatedMessages);

        // ส่ง callback กลับ client ว่าสำเร็จ
        if (callback) callback({ status: "ok" });
      } catch (err) {
        console.error(err);
        if (callback) callback({ status: "error", error: err.message });
      }
    });
    // ออกจากห้อง conversation
    socket.on("leaveRoom", (conversationId) => {
      socket.leave(conversationId);
      console.log(`User ${socket.data.userId} left room ${conversationId}`);

      const room = io.sockets.adapter.rooms.get(conversationId);
      const onlineUsers = room
        ? [...room].map((id) => io.sockets.sockets.get(id)?.data.userId)
        : [];
      io.to(conversationId).emit("roomOnlineUsers", onlineUsers);
      io.to(conversationId).emit("userLeft", {
        userId: socket.data.userId,
        room: conversationId,
      });
    });

    // disconnect → ออกจากทุกห้อง
    socket.on("disconnect", () => {
      for (const room of socket.rooms) {
        if (room !== socket.id) {
          socket
            .to(room)
            .emit("userLeft", { userId: socket.data.userId, room });
          const clientsInRoom = [...(io.sockets.adapter.rooms.get(room) || [])];
          const onlineUsers = clientsInRoom.map(
            (id) => io.sockets.sockets.get(id)?.data.userId
          );
          io.to(room).emit("roomOnlineUsers", onlineUsers);
        }
      }
      console.log("🔴 Socket disconnected:", socket.id);
    });
  });

  ///payment getway io socket io
  const paymentNamespace = io.of("/payment");
  paymentNamespace.on("connection", (socket) => {
    console.log("💰 Payment connected:", socket.id);
    console.log(
      "Total connected clients:",
      io.of("/payment").sockets.size || 0
    );
  });
  // ✅ ส่งกลับออกไปให้ controller ใช้
  return { io, userSocketMap };
}

module.exports = initializeSocket;
