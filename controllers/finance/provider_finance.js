// controllers/sellerFinanceController.js
const balance = require("../../models/balance");
const Balance = require("../../models/balance");
const Transaction = require("../../models/transaction");
const WithdrawRequest = require("../../models/withdrawRequest");
const User = require("../../models/user");
const Seller = require("../../models/sellers");
const mongoose = require("mongoose");
// GET /api/seller/finance/summary
function getStatusInThai(status) {
  switch (status) {
    case "pending_payout":
      return "ລໍຖ້າດຳເນີນການ";
    case "PAYMENT_COMPLETED":
      return "ສຳເລັດ";
    case "withdrawn":
      return "ຖອນແລ້ວ";
    default:
      return "ไม่ทราบสถานะ";
  }
}

const getFinanceSummary = async (req, res) => {
  try {
    const sellerId = req.id;

    // Get current balance
    const balance = await Balance.findOne({ seller_id: sellerId });
    const currentBalance = balance ? balance.balance : 0;

    // Get all transactions for this seller
    const transactions = await Transaction.find({ seller_id: sellerId });

    // Calculate summary data
    const totalSales = transactions
      .filter((t) => t.transaction_type === "sale")
      .reduce((sum, t) => sum + t.subtotal, 0);

    const totalFees = transactions
      .filter((t) => t.transaction_type === "sale")
      .reduce((sum, t) => sum + t.fee_system, 0);

    const netEarnings = totalSales - totalFees;

    const totalOrders = transactions.filter(
      (t) => t.transaction_type === "sale"
    ).length;

    // Pending payout (PAYMENT_COMPLETED but not withdrawn)
    const pendingPayout = transactions
      .filter((t) => t.status === "PAYMENT_COMPLETED")
      .reduce((sum, t) => sum + t.total_summary, 0);

    // Already withdrawn
    const withdrawn = transactions
      .filter((t) => t.status === "withdrawn")
      .reduce((sum, t) => sum + t.total_summary, 0);
    const pending_payout = transactions
      .filter((t) => t.status === "pending_payout")
      .reduce((sum, t) => sum + t.total_summary, 0);
    // Calculate growth rate (mock for now)
    const growthRate = 12.5; // This should be calculated based on previous period
    const totalBalance = await Balance.findOne({
      seller_id: sellerId,
    });
    res.json({
      success: true,
      data: {
        totalSales,
        pending_payout,
        netEarnings,
        totalOrders,
        withdrawn,
        totalBalance,
        currentBalance,
        growthRate,
        isPositive: true,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลสรุป",
      error: error.message,
    });
  }
};

// GET /api/seller/finance/transactions
const getTransactions = async (req, res) => {
  try {
    const sellerId = req.id;
    const { page = 1, limit = 10, status, type, search } = req.query;

    let query = { seller_id: sellerId };

    if (status && status !== "all") {
      query.status = status;
    }

    if (type && type !== "all") {
      query.transaction_type = type;
    }

    const transactions = await Transaction.find(query)
      .populate("order_id")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments(query);

    // Transform data for frontend
    const formattedTransactions = transactions.map((transaction) => ({
      id: transaction._id,
      date: transaction.createdAt,
      type: transaction.transaction_type === "sale" ? "ຂາຍ" : "ຖອນ",
      amount:
        transaction.transaction_type === "sale"
          ? transaction.total_summary
          : -transaction.amount,
      status: getStatusInThai(transaction.status),
      note:
        transaction.transaction_type === "sale" ? `ຂາຍສິນຄ້າ` : "ຖອນເງິນອອກ",
      order_id: transaction.order_id,
      subtotal: transaction.subtotal,
      fee_system: transaction.fee_system,
      total_summary: transaction.total_summary,
    }));

    res.json({
      success: true,
      data: {
        transactions: formattedTransactions,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลธุรกรรม",
      error: error.message,
    });
  }
};

// GET /api/seller/finance/analytics
const getAnalytics = async (req, res) => {
  try {
    const sellerId = req.id;
    const { period = "today" } = req.query;

    let startDate = new Date();
    const endDate = new Date();

    switch (period) {
      case "today":
        startDate.setHours(0, 0, 0, 0);
        break;
      case "7d":
        startDate.setDate(startDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
        break;
      case "30d":
        startDate.setDate(startDate.getDate() - 29);
        startDate.setHours(0, 0, 0, 0);
        break;
      case "month":
        startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        break;
      case "year":
        startDate = new Date(startDate.getFullYear(), 0, 1);
        break;
    }

    // ✅ Query transactions
    const transactionsByDay = await Transaction.aggregate([
      {
        $match: {
          seller_id: new mongoose.Types.ObjectId(sellerId),
          transaction_type: "sale",
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
              timezone: "Asia/Bangkok",
            },
          },
          totalEarnings: { $sum: "$total_summary" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // ✅ หา Peak

    // ✅ สร้าง chartData
    const chartData = [];
    const days = [
      "ວັນອາທິດ",
      "ວັນຈັນ",
      "ວັນອັງຄານ",
      "ວັນພຸດ",
      "ວັນພະຫັດ",
      "ວັນສຸກ",
      "ວັນເສົາ",
    ];

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = currentDate.toLocaleDateString("en-CA");
      const dayTransaction = transactionsByDay.find(
        (t) => t._id === String(dateStr)
      );

      chartData.push({
        name: days[currentDate.getDay()],
        value: dayTransaction ? dayTransaction.totalEarnings : 0,
        date: dateStr,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    res.json({
      success: true,
      data: {
        chartData,
        period,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลสถิติ",
      error: error.message,
    });
  }
};

// POST /api/seller/finance/withdraw
const requestWithdraw = async (req, res) => {
  try {
    const sellerId = req.id;
    const { amount, note } = req.body;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "ກະລຸນາລະບຸຈຳນວນເງິນໃຫ້ຄົບຖ້ວນ",
      });
    }

    // Check available balance
    const availableAmount = await balance.find({
      seller_id: sellerId,
    });
    if (amount > availableAmount.balance) {
      return res.status(400).json({
        success: false,
        message:
          "ຈຳນວນເງິນທີ່ຕ້ອງການຖອນເກີນກວ່າຈຳນວນເງິນທີ່ມີ ກະລຸນາກວດສອບກ່ອນຖອນ",
      });
    }

    // Create withdraw request
    const withdrawRequest = new WithdrawRequest({
      seller_id: sellerId,
      amount,
      note,
    });

    await withdrawRequest.save();
    await balance.findOneAndUpdate(
      { seller_id: sellerId },
      { $push: { withdrewIds: withdrawRequest._id } },
      { new: true } // return document หลัง update
    );
    res.json({
      success: true,
      message: "ສົ່ງຄຳຂໍຖອນເງິນສຳເລັດ",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการส่งคำขอถอนเงิน",
      error: error.message,
    });
  }
};

// GET /api/seller/finance/withdraw-requests
const getWithdrawRequests = async (req, res) => {
  try {
    const sellerId = req.id;
    const { page = 1, limit = 10 } = req.query;

    const requests = await WithdrawRequest.find({ seller_id: sellerId })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await WithdrawRequest.countDocuments({ seller_id: sellerId });

    res.json({
      success: true,
      data: {
        requests,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลคำขอถอนเงิน",
      error: error.message,
    });
  }
};
//show admin financce
const get_balance = async (req, res) => {
  try {
    const balances = await Balance.find()
      .populate("seller_id")
      .populate("withdrewIds");

    // เพิ่ม seller_model เข้าไปในแต่ละ balance
    const balancesWithSeller = await Promise.all(
      balances.map(async (balance) => {
        const seller_model = await Seller.findOne({
          user_id: balance.seller_id._id,
        }).select(
          " store_name  store_code bank_account_images bank_name bank_account_name bank_account_number"
        );

        return {
          ...balance.toObject(), // แปลงเป็น plain object ก่อน
          seller_model,
        };
      })
    );

    res.json({
      success: true,
      data: balancesWithSeller,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลคำขอถอนเงิน",
      error: error.message,
    });
  }
};
const Approving_withdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // หาคำขอถอนเงิน
    const withdrawRequest = await WithdrawRequest.findById(id);

    if (!withdrawRequest) {
      return res.status(404).json({
        success: false,
        message: "ไม่พบคำขอถอนเงิน",
      });
    }

    let updatedBalance = null;

    if (status === "success") {
      // ✅ อัปเดต balance ของ seller เฉพาะตอน approved
      updatedBalance = await Balance.findOneAndUpdate(
        { seller_id: withdrawRequest.seller_id },
        {
          $push: { withdrewIds: withdrawRequest._id }, // เก็บประวัติ withdraw
          $inc: { balance: -withdrawRequest.amount }, // หักยอดเงินออก
        },
        { new: true }
      ).populate("seller_id withdrewIds");
    }

    // ✅ อัปเดตสถานะ ไม่ว่าจะ approved หรือ rejected
    withdrawRequest.status = status;
    await withdrawRequest.save();

    res.json({
      success: true,
      message:
        status === "success"
          ? "อนุมัติคำขอถอนเงินสำเร็จ"
          : "ปฏิเสธคำขอถอนเงินสำเร็จ",
      data: {
        withdrawRequest,
        updatedBalance,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการจัดการคำขอถอนเงิน",
      error: error.message,
    });
  }
};

module.exports = {
  getFinanceSummary,
  getTransactions,
  getAnalytics,
  requestWithdraw,
  getWithdrawRequests,
  get_balance,
  Approving_withdrawal,
};
// app.js - Add route
