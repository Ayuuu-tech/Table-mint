/**
 * Analytics Query Optimization
 * Prevents full table scans with proper indexing and aggregation pipelines
 */

const mongoose = require('mongoose');

/**
 * Index definitions for analytics models
 * Add these to your mongoose schemas or ensure they exist in MongoDB
 */
const ANALYTICS_INDEXES = {
  orders: [
    { createdAt: -1 },
    { createdAt: -1, status: 1 },
    { createdAt: -1, restaurantId: 1 },
    { customerId: 1, createdAt: -1 },
    { restaurantId: 1, createdAt: -1 },
    { status: 1, createdAt: -1 },
    { totalAmount: -1, createdAt: -1 }
  ],
  bills: [
    { createdAt: -1 },
    { createdAt: -1, status: 1 },
    { restaurantId: 1, createdAt: -1 },
    { orderId: 1, createdAt: -1 },
    { totalAmount: -1 }
  ],
  reservations: [
    { createdAt: -1 },
    { reservationDate: -1 },
    { restaurantId: 1, reservationDate: -1 },
    { status: 1, reservationDate: -1 },
    { customerId: 1, reservationDate: -1 }
  ],
  transactions: [
    { createdAt: -1 },
    { type: 1, createdAt: -1 },
    { restaurantId: 1, createdAt: -1 },
    { orderId: 1 },
    { amount: -1 }
  ],
  users: [
    { createdAt: -1 },
    { restaurantId: 1 },
    { role: 1, createdAt: -1 }
  ]
};

/**
 * Initialize all recommended indexes
 * Run this once during app startup
 */
exports.initializeAnalyticsIndexes = async (models) => {
  try {
    for (const [modelName, indexes] of Object.entries(ANALYTICS_INDEXES)) {
      const model = models[modelName] || mongoose.model(modelName);

      if (!model) {
        console.warn(`⚠️ Model ${modelName} not found for indexing`);
        continue;
      }

      for (const indexSpec of indexes) {
        try {
          await model.collection.createIndex(indexSpec, { background: true });
          console.log(`✓ Index created on ${modelName}:`, indexSpec);
        } catch (error) {
          if (error.code === 85) {
            // Index already exists with different options
            console.log(`⚠️ Index already exists on ${modelName}`);
          } else {
            console.error(`✗ Failed to create index on ${modelName}:`, error.message);
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to initialize analytics indexes:', error);
  }
};

/**
 * Daily revenue aggregation (optimized)
 * Uses aggregation pipeline instead of fetching all documents
 */
exports.getDailyRevenue = async (restaurantId, startDate, endDate) => {
  try {
    const Order = mongoose.model('Order');

    const result = await Order.aggregate([
      {
        $match: {
          restaurantId: mongoose.Types.ObjectId(restaurantId),
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $in: ['completed', 'paid'] }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          revenue: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' }
        }
      },
      {
        $sort: { _id: -1 }
      }
    ]);

    return result;
  } catch (error) {
    console.error('Daily revenue query failed:', error);
    throw error;
  }
};

/**
 * Order status distribution (optimized)
 */
exports.getOrderStatusDistribution = async (restaurantId, days = 30) => {
  try {
    const Order = mongoose.model('Order');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await Order.aggregate([
      {
        $match: {
          restaurantId: mongoose.Types.ObjectId(restaurantId),
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    return result;
  } catch (error) {
    console.error('Status distribution query failed:', error);
    throw error;
  }
};

/**
 * Peak hours analysis (optimized)
 */
exports.getPeakHours = async (restaurantId, startDate, endDate) => {
  try {
    const Order = mongoose.model('Order');

    const result = await Order.aggregate([
      {
        $match: {
          restaurantId: mongoose.Types.ObjectId(restaurantId),
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $hour: '$createdAt'
          },
          orderCount: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' },
          maxAmount: { $max: '$totalAmount' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    return result.map((hour) => ({
      hour: `${String(hour._id).padStart(2, '0')}:00`,
      orderCount: hour.orderCount,
      avgOrderValue: hour.avgOrderValue,
      maxAmount: hour.maxAmount
    }));
  } catch (error) {
    console.error('Peak hours query failed:', error);
    throw error;
  }
};

/**
 * Top selling items (optimized with lookup)
 */
exports.getTopSellingItems = async (restaurantId, limit = 10, days = 30) => {
  try {
    const Order = mongoose.model('Order');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await Order.aggregate([
      {
        $match: {
          restaurantId: mongoose.Types.ObjectId(restaurantId),
          createdAt: { $gte: startDate }
        }
      },
      {
        $unwind: '$items'
      },
      {
        $group: {
          _id: '$items.menuItemId',
          itemName: { $first: '$items.itemName' },
          quantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          avgPrice: { $avg: '$items.price' }
        }
      },
      {
        $sort: { quantity: -1 }
      },
      {
        $limit: limit
      }
    ]);

    return result;
  } catch (error) {
    console.error('Top selling items query failed:', error);
    throw error;
  }
};

/**
 * Customer lifetime value (optimized)
 */
exports.getCustomerLTV = async (restaurantId, limit = 20) => {
  try {
    const Order = mongoose.model('Order');

    const result = await Order.aggregate([
      {
        $match: {
          restaurantId: mongoose.Types.ObjectId(restaurantId),
          customerId: { $exists: true }
        }
      },
      {
        $group: {
          _id: '$customerId',
          totalSpent: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' },
          firstOrderDate: { $min: '$createdAt' },
          lastOrderDate: { $max: '$createdAt' }
        }
      },
      {
        $sort: { totalSpent: -1 }
      },
      {
        $limit: limit
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'customer'
        }
      },
      {
        $unwind: { path: '$customer', preserveNullAndEmptyArrays: true }
      },
      {
        $project: {
          _id: 1,
          customerName: '$customer.name',
          customerEmail: '$customer.email',
          totalSpent: 1,
          orderCount: 1,
          avgOrderValue: 1,
          firstOrderDate: 1,
          lastOrderDate: 1
        }
      }
    ]);

    return result;
  } catch (error) {
    console.error('Customer LTV query failed:', error);
    throw error;
  }
};

/**
 * Revenue by category (optimized)
 */
exports.getRevenueByCategory = async (restaurantId, startDate, endDate) => {
  try {
    const Order = mongoose.model('Order');
    const MenuItem = mongoose.model('MenuItem');

    const result = await Order.aggregate([
      {
        $match: {
          restaurantId: mongoose.Types.ObjectId(restaurantId),
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $in: ['completed', 'paid'] }
        }
      },
      {
        $unwind: '$items'
      },
      {
        $lookup: {
          from: 'menuitems',
          localField: 'items.menuItemId',
          foreignField: '_id',
          as: 'menuItem'
        }
      },
      {
        $unwind: { path: '$menuItem', preserveNullAndEmptyArrays: true }
      },
      {
        $group: {
          _id: '$menuItem.category',
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          quantity: { $sum: '$items.quantity' },
          avgPrice: { $avg: '$items.price' }
        }
      },
      {
        $sort: { revenue: -1 }
      }
    ]);

    return result;
  } catch (error) {
    console.error('Revenue by category query failed:', error);
    throw error;
  }
};

/**
 * Table occupancy rate (optimized)
 */
exports.getTableOccupancyRate = async (restaurantId, startDate, endDate) => {
  try {
    const Reservation = mongoose.model('Reservation');

    const result = await Reservation.aggregate([
      {
        $match: {
          restaurantId: mongoose.Types.ObjectId(restaurantId),
          reservationDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$tableId',
          totalReservations: { $sum: 1 },
          completedReservations: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          averageDuration: { $avg: '$duration' }
        }
      },
      {
        $addFields: {
          occupancyRate: {
            $multiply: [
              { $divide: ['$completedReservations', '$totalReservations'] },
              100
            ]
          }
        }
      },
      {
        $sort: { occupancyRate: -1 }
      }
    ]);

    return result;
  } catch (error) {
    console.error('Table occupancy query failed:', error);
    throw error;
  }
};

/**
 * Monthly comparison (optimized)
 */
exports.getMonthlyComparison = async (restaurantId, months = 12) => {
  try {
    const Order = mongoose.model('Order');

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const result = await Order.aggregate([
      {
        $match: {
          restaurantId: mongoose.Types.ObjectId(restaurantId),
          createdAt: { $gte: startDate },
          status: { $in: ['completed', 'paid'] }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          revenue: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' }
        }
      },
      {
        $sort: { '_id.year': -1, '_id.month': -1 }
      }
    ]);

    return result.map((item) => ({
      month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
      revenue: item.revenue,
      orderCount: item.orderCount,
      avgOrderValue: item.avgOrderValue
    }));
  } catch (error) {
    console.error('Monthly comparison query failed:', error);
    throw error;
  }
};

/**
 * Payment method distribution (optimized)
 */
exports.getPaymentMethodDistribution = async (restaurantId, startDate, endDate) => {
  try {
    const Bill = mongoose.model('Bill');

    const result = await Bill.aggregate([
      {
        $match: {
          restaurantId: mongoose.Types.ObjectId(restaurantId),
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
          avgAmount: { $avg: '$totalAmount' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    return result;
  } catch (error) {
    console.error('Payment method distribution query failed:', error);
    throw error;
  }
};

/**
 * Query performance analyzer
 * Provides insights into slow queries
 */
exports.analyzeQueryPerformance = async (restaurantId) => {
  try {
    const systemStats = await mongoose.connection.db.collection('system.profile').findOne(
      {
        'attr.command.restaurantId': mongoose.Types.ObjectId(restaurantId),
        millis: { $gt: 100 } // Queries taking >100ms
      },
      { sort: { ts: -1 } }
    );

    return {
      slowQueries: systemStats || [],
      recommendation: systemStats
        ? '⚠️ Slow queries detected. Consider adding indexes on query fields.'
        : '✓ No slow queries detected'
    };
  } catch (error) {
    console.warn('Query profiling not enabled:', error.message);
    return { slowQueries: [], recommendation: 'Enable profiling: db.setProfilingLevel(1)' };
  }
};

/**
 * Bulk analytics fetch with caching ready
 * Returns multiple metrics in one optimized call
 */
exports.getDashboardMetrics = async (restaurantId, startDate, endDate) => {
  try {
    // Run aggregations in parallel
    const [
      dailyRevenue,
      statusDistribution,
      topItems,
      paymentMethods,
      monthlyComparison
    ] = await Promise.all([
      exports.getDailyRevenue(restaurantId, startDate, endDate),
      exports.getOrderStatusDistribution(restaurantId),
      exports.getTopSellingItems(restaurantId, 5),
      exports.getPaymentMethodDistribution(restaurantId, startDate, endDate),
      exports.getMonthlyComparison(restaurantId, 6)
    ]);

    return {
      dailyRevenue,
      statusDistribution,
      topItems,
      paymentMethods,
      monthlyComparison,
      generatedAt: new Date()
    };
  } catch (error) {
    console.error('Dashboard metrics fetch failed:', error);
    throw error;
  }
};

module.exports = exports;
