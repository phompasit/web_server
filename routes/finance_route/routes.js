const express = require("express");

const {
  authMiddlewares,
  authorizeRoles,
} = require("../../middlewares/authMiddlewares");
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
router.get(
  "/getFinanceSummary",
  authMiddlewares,
  authorizeRoles("admin", "seller"),
  getFinanceSummary
);

// // GET /api/seller/finance/transactions
router.get(
  "/transactions",
  authMiddlewares,
  authorizeRoles("admin", "seller"),
  getTransactions
);

// // GET /api/seller/finance/analytics
router.get(
  "/analytics",
  authMiddlewares,
  authorizeRoles("admin", "seller"),
  getAnalytics
);

// // POST /api/seller/finance/withdraw
router.post(
  "/withdraw",
  authMiddlewares,
  authorizeRoles("admin", "seller"),
  requestWithdraw
);

// // GET /api/seller/finance/withdraw-requests
router.get(
  "/withdraw-requests",
  authMiddlewares,
  authorizeRoles("admin", "seller"),
  getWithdrawRequests
);

router.get(
  "/dashbord",
  authMiddlewares,
  authorizeRoles("admin", "seller"),
  dashbord_seller
);
///admin_finance
router.get(
  "/get_balance",
  authMiddlewares,
  authorizeRoles("admin", "seller"),
  get_balance
);
///Approving_withdrawal
router.patch(
  "/Approving_withdrawal/:id",
  authorizeRoles("admin", "seller"),
  authMiddlewares,
  Approving_withdrawal
);
module.exports = router;
///open-conversation
