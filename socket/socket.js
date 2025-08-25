const { Server } = require("socket.io");

const userSocketMap = new Map(); // ✅ ใช้ Map
const sellerSubscriptions = {}; // เก็บ subscription ตาม userId
function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: ["http://localhost:5173"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("🟢 Socket connected:", socket.id);
    ///ອະນຸຍາດແຈ້ງເຕືອນການຜ່ານອະນຸມັດ
    socket.on("access_verify_seller_notification", (userId) => {
      userSocketMap.set(userId, socket.id);
      console.log("📌 Registered seller user:", userId);
    });
    /////ແຈ້ງເຕືອນປະຕິເສດການຜ່ານຢືນຢັ້ນຕົວຕົນ
    socket.on("rejected_verify_seller_notification", (userId) => {
      userSocketMap.set(userId, socket.id);
      console.log("📌 reject verify seller user:", userId);
    });

    ///////
    socket.on("register-subscription", ({ userId, subscription }) => {
      sellerSubscriptions[userId] = subscription;
      console.log("📌 Registered Push Subscription for", userId);
    });
    socket.on("admin-approve", ({ sellerId, message }) => {
      const subscription = sellerSubscriptions[sellerId];
      if (subscription) {
        const payload = JSON.stringify({
          title: "คำขอได้รับการอนุมัติ",
          body: message,
          icon: "/icon.png",
        });

        webpush.sendNotification(subscription, payload).catch(console.error);
      }

      io.to(sellerId).emit("approved-notify", { message });
    });
    socket.on("disconnect", () => {
      for (const [userId, socketId] of userSocketMap.entries()) {
        if (socketId === socket.id) {
          userSocketMap.delete(userId);
          console.log("❌ Removed user:", userId);
          break;
        }
      }
      console.log("🔴 Socket disconnected:", socket.id);
    });
  });

  // ✅ ส่งกลับออกไปให้ controller ใช้
  return { io, userSocketMap };
}

module.exports = initializeSocket;
