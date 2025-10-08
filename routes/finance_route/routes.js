const express = require("express");

const { authMiddlewares } = require("../../middlewares/authMiddlewares");
const {
  getFinanceSummary,
  getTransactions,
  getAnalytics,
  requestWithdraw,
  getWithdrawRequests,
  get_balance,
  Approving_withdrawal,
} = require("../../controllers/finance/provider_finance");
const {
  dashbord_seller,
} = require("../../controllers/finance/dashbord_seller");
const router = express.Router();

// GET /api/seller/finance/summary
router.get("/getFinanceSummary", authMiddlewares, getFinanceSummary);

// // GET /api/seller/finance/transactions
router.get("/transactions", authMiddlewares, getTransactions);

// // GET /api/seller/finance/analytics
router.get("/analytics", authMiddlewares, getAnalytics);

// // POST /api/seller/finance/withdraw
router.post("/withdraw", authMiddlewares, requestWithdraw);

// // GET /api/seller/finance/withdraw-requests
router.get("/withdraw-requests", authMiddlewares, getWithdrawRequests);

router.get("/dashbord", authMiddlewares, dashbord_seller);
///admin_finance
router.get("/get_balance", authMiddlewares, get_balance);
///Approving_withdrawal
router.patch("/Approving_withdrawal/:id", authMiddlewares, Approving_withdrawal)
module.exports = router;
///open-conversation
