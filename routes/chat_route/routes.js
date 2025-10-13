const express = require("express");
const {
  openConversation,
  getConversation_all,
  sendMessage,
  getConversation,
  getUnreadCount,
} = require("../../controllers/chat_controllers/chat_controllers");
const { authMiddlewares } = require("../../middlewares/authMiddlewares");

const router = express.Router();
////າສ່ວນນີ້ຈະໃຫ້ເບີງເທົ່ານັ້ນເພື່ອທົດສອບບ ສ່ວນນີ້ໃຊ້ງານຈິງຢູ່ files socket.js real time chatt 
router.post("/open-conversation", authMiddlewares, openConversation);
router.get("/get-conversations", authMiddlewares, getConversation_all);
router.get("/getConversation/:conversationId", authMiddlewares, getConversation);
router.post("/send-message", authMiddlewares, sendMessage);
router.get("/getUnreadCount",authMiddlewares, getUnreadCount)
module.exports = router;
///open-conversation
