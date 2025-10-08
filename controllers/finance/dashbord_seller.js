const Transaction = require("../../models/transaction");
const Product = require("../../models/products");
const mongoose = require("mongoose");

/**
 * Get seller dashboard analytics data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const dashbord_seller = async (req, res) => {
  try {
    const sellerId = req.id;
    const { period = "7d" } = req.query;

    // Validate sellerId
    if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid seller ID",
      });
    }

    // 🕒 Calculate date range based on period
    const { startDate, endDate } = getDateRange(period);
    console.log(startDate, endDate);
    // Run all queries in parallel for better performance
    const [
      transactions,
      products,
      latestOrders,
      salesTrends,
    ] = await Promise.all([
      // Get transactions for the period
      Transaction.find({
        seller_id: sellerId,
        createdAt: { $gte: startDate, $lte: endDate },
      }).lean(),

      // Get seller's products with category info
      Product.find({ user_id: sellerId })
        .select("sold_count name price stock status categoryId")
        .populate("categoryId", "name")
        .lean(),

      // Get latest orders
      Transaction.find({
        seller_id: sellerId,
        transaction_type: "sale",
        status: { $in: ["PAYMENT_COMPLETED", "pending_payout", "withdrawn"] },
        createdAt: { $gte: startDate, $lte: endDate },
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("order_id", "items total_summary orderId")
        .lean(),

      // Get sales trends using aggregation
      Transaction.aggregate([
        {
          $match: {
            seller_id: new mongoose.Types.ObjectId(sellerId),
            transaction_type: "sale",
            status: { $in: ["PAYMENT_COMPLETED", "pending_payout", "withdrawn"] },
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
            totalRevenue: { $sum: "$total_summary" },
            totalOrders: { $sum: 1 },
            averageOrderValue: { $avg: "$total_summary" },
          },
        },
        {
          $sort: { _id: 1 },
        },
      ]),
    ]);

    // Calculate sales metrics
    const salesTransactions = transactions.filter(
      (t) => t.transaction_type === "sale"
    );
    const salesMetrics = calculateSalesMetrics(salesTransactions);

    // Process product data
    const productAnalytics = processProductData(products);

    // Fill missing dates in sales trends for consistent chart data
    const filledSalesTrends = fillMissingDates(salesTrends, startDate, endDate);

    // Prepare response data
    const dashboardData = {
      // Sales Overview
      totalSales: salesMetrics.totalSales,
      totalOrders: salesMetrics.totalOrders,
      totalProfit: salesMetrics.totalProfit,
      averageOrderValue: salesMetrics.averageOrderValue,

      // Product Analytics
      topProduct: productAnalytics.topProduct,
      topFiveProducts: productAnalytics.topFiveProducts,
      totalProducts: products.length,
      lowStockProducts: productAnalytics.lowStockProducts,

      // Recent Activity
      latestOrders: latestOrders.map(formatOrderData),

      // Category Performance
      categoryPerformance: productAnalytics.categoryPerformance,

      // Trends
      salesTrends: filledSalesTrends,

      // Period Info
      period: {
        type: period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    };

    res.json({
      success: true,
      data: dashboardData,
    });
  } catch (error) {
    console.error("❌ Dashboard loading error:", error);

    // Send appropriate error response
    const statusCode = error.name === "ValidationError" ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: "Failed to load dashboard data",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Calculate date range based on period parameter
 * @param {string} period - Period type
 * @returns {Object} Object containing startDate and endDate
 */
function getDateRange(period) {
  const tzOffset = 7 * 60; // Asia/Bangkok UTC+7 (เป็นนาที)

  // วันปัจจุบันในเวลาไทย
  let now = new Date();
  let bangkokNow = new Date(now.getTime() + tzOffset * 60 * 1000);

  let startDate, endDate;

  switch (period) {
    case "today":
      startDate = new Date(
        Date.UTC(
          bangkokNow.getUTCFullYear(),
          bangkokNow.getUTCMonth(),
          bangkokNow.getUTCDate()
        )
      );
      endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + 1);
      endDate.setUTCMilliseconds(endDate.getUTCMilliseconds() - 1);
      break;

    case "7d":
      startDate = new Date(
        Date.UTC(
          bangkokNow.getUTCFullYear(),
          bangkokNow.getUTCMonth(),
          bangkokNow.getUTCDate() - 6
        )
      );
      endDate = new Date(
        Date.UTC(
          bangkokNow.getUTCFullYear(),
          bangkokNow.getUTCMonth(),
          bangkokNow.getUTCDate() + 1
        )
      );
      endDate.setUTCMilliseconds(endDate.getUTCMilliseconds() - 1);
      break;

    case "30d":
      startDate = new Date(
        Date.UTC(
          bangkokNow.getUTCFullYear(),
          bangkokNow.getUTCMonth(),
          bangkokNow.getUTCDate() - 29
        )
      );
      endDate = new Date(
        Date.UTC(
          bangkokNow.getUTCFullYear(),
          bangkokNow.getUTCMonth(),
          bangkokNow.getUTCDate() + 1
        )
      );
      endDate.setUTCMilliseconds(endDate.getUTCMilliseconds() - 1);
      break;

    case "month":
      startDate = new Date(
        Date.UTC(bangkokNow.getUTCFullYear(), bangkokNow.getUTCMonth(), 1)
      );
      endDate = new Date(
        Date.UTC(bangkokNow.getUTCFullYear(), bangkokNow.getUTCMonth() + 1, 1)
      );
      endDate.setUTCMilliseconds(endDate.getUTCMilliseconds() - 1);
      break;

    case "year":
      startDate = new Date(Date.UTC(bangkokNow.getUTCFullYear(), 0, 1));
      endDate = new Date(Date.UTC(bangkokNow.getUTCFullYear() + 1, 0, 1));
      endDate.setUTCMilliseconds(endDate.getUTCMilliseconds() - 1);
      break;
  }

  return { startDate, endDate };
}

/**
 * Calculate sales metrics from transactions
 * @param {Array} transactions - Array of sale transactions
 * @returns {Object} Sales metrics
 */
function calculateSalesMetrics(transactions) {
  const totalSales = transactions.reduce(
    (sum, t) => sum + (t.subtotal || 0),
    0
  );
  const totalOrders = transactions.length;
  const totalProfit = transactions.reduce(
    (sum, t) => sum + (t.total_summary || 0),
    0
  );
  const averageOrderValue = totalOrders > 0 ? totalProfit / totalOrders : 0;

  return {
    totalSales: parseFloat(totalSales.toFixed(2)),
    totalOrders,
    totalProfit: parseFloat(totalProfit.toFixed(2)),
    averageOrderValue: parseFloat(averageOrderValue.toFixed(2)),
  };
}

/**
 * Process product data for analytics
 * @param {Array} products - Array of products
 * @returns {Object} Product analytics
 */
function processProductData(products) {
  // Find top selling product
  const topProduct = products.reduce((max, product) => {
    const soldCount = product.sold_count || 0;
    const maxSoldCount = max?.sold_count || 0;
    return soldCount > maxSoldCount ? product : max;
  }, null);

  // Get top 5 products
  const topFiveProducts = products
    .sort((a, b) => (b.sold_count || 0) - (a.sold_count || 0))
    .slice(0, 5)
    .map((product) => ({
      _id: product._id,
      name: product.name,
      sold_count: product.sold_count || 0,
      price: product.price,
      stock: product.stock,
      revenue: (product.sold_count || 0) * (product.price || 0),
    }));

  // Find low stock products (stock < 10)
  const lowStockProducts = products.filter(
    (product) => product.stock < 10 && product.status === "active"
  ).length;

  // Calculate category performance
  const categoryMap = new Map();
  products.forEach((product) => {
    if (product.categoryId) {
      const categoryName = product.categoryId.name || "Uncategorized";
      const existing = categoryMap.get(categoryName) || {
        name: categoryName,
        productCount: 0,
        totalSold: 0,
        totalRevenue: 0,
      };

      existing.productCount++;
      existing.totalSold += product.sold_count || 0;
      existing.totalRevenue += (product.sold_count || 0) * (product.price || 0);

      categoryMap.set(categoryName, existing);
    }
  });

  const categoryPerformance = Array.from(categoryMap.values()).sort(
    (a, b) => b.totalRevenue - a.totalRevenue
  );

  return {
    topProduct,
    topFiveProducts,
    lowStockProducts,
    categoryPerformance,
  };
}

/**
 * Format order data for response
 * @param {Object} order - Order object
 * @returns {Object} Formatted order data
 */
function formatOrderData(order) {
  return {
    _id: order._id,
    orderId: order.order_id?.orderId || "N/A",
    total: order.total_summary || 0,
    status: order.status,
    createdAt: order.createdAt,
    itemCount: order.order_id?.items?.length || 0,
  };
}

/**
 * Fill missing dates in sales trends for consistent chart data
 * @param {Array} salesTrends - Sales trends data
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Array} Filled sales trends data
 */
function fillMissingDates(salesTrends, startDate, endDate) {
  const filledData = [];
  const trendMap = new Map();

  // Create map of existing data
  salesTrends.forEach((trend) => {
    trendMap.set(trend._id, trend);
  });

  // Fill missing dates
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateString = currentDate.toISOString().split("T")[0];
    const existingData = trendMap.get(dateString);

    filledData.push({
      date: dateString,
      totalRevenue: existingData?.totalRevenue || 0,
      totalOrders: existingData?.totalOrders || 0,
      averageOrderValue: existingData?.averageOrderValue || 0,
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return filledData;
}

module.exports = { dashbord_seller };
