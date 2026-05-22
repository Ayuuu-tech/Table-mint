/**
 * Advanced Reporting Service
 * 
 * Provides comprehensive business analytics and insights
 * - Daily sales tracking
 * - Monthly revenue analysis
 * - Item-wise performance
 * - Table efficiency metrics
 * - Staff performance tracking
 */

const Bill = require('../models/Bill');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const Table = require('../models/Table');

class ReportingService {
  /**
   * Get daily sales for a specific date
   */
  static async getDailySales(restaurantId, date = new Date()) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const bills = await Bill.find({
      restaurantId,
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      paymentStatus: 'PAID'
    });

    const totalSales = bills.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0);
    const totalGST = bills.reduce((sum, bill) => sum + (bill.tax || 0), 0);
    const totalDiscount = bills.reduce((sum, bill) => sum + (bill.discount || 0), 0);

    return {
      date: date.toISOString().split('T')[0],
      billCount: bills.length,
      totalSales,
      totalGST,
      totalDiscount,
      averageBillValue: bills.length > 0 ? (totalSales / bills.length).toFixed(2) : 0,
      paymentBreakdown: this.getPaymentBreakdown(bills),
      bills
    };
  }

  /**
   * Get monthly revenue with daily breakdown
   */
  static async getMonthlyRevenue(restaurantId, year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const bills = await Bill.find({
      restaurantId,
      createdAt: {
        $gte: startDate,
        $lte: new Date(endDate.getTime() + 86400000)
      },
      paymentStatus: 'PAID'
    }).sort({ createdAt: 1 });

    // Group by date
    const dailyBreakdown = {};
    bills.forEach(bill => {
      const day = bill.createdAt.toISOString().split('T')[0];
      if (!dailyBreakdown[day]) {
        dailyBreakdown[day] = {
          date: day,
          sales: 0,
          gst: 0,
          discount: 0,
          bills: 0,
          paymentModes: {}
        };
      }
      dailyBreakdown[day].sales += bill.totalAmount || 0;
      dailyBreakdown[day].gst += bill.tax || 0;
      dailyBreakdown[day].discount += bill.discount || 0;
      dailyBreakdown[day].bills += 1;

      const mode = bill.paymentMode || 'UNKNOWN';
      if (!dailyBreakdown[day].paymentModes[mode]) {
        dailyBreakdown[day].paymentModes[mode] = 0;
      }
      dailyBreakdown[day].paymentModes[mode] += bill.totalAmount || 0;
    });

    const totalSales = bills.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0);
    const totalGST = bills.reduce((sum, bill) => sum + (bill.tax || 0), 0);

    return {
      year,
      month,
      period: `${year}-${String(month).padStart(2, '0')}`,
      totalSales,
      totalGST,
      totalBills: bills.length,
      averageDailySales: bills.length > 0 ? (totalSales / Object.keys(dailyBreakdown).length).toFixed(2) : 0,
      dailyBreakdown: Object.values(dailyBreakdown)
    };
  }

  /**
   * Get top-selling items by revenue and quantity
   */
  static async getItemWiseSales(restaurantId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const bills = await Bill.find({
      restaurantId,
      createdAt: { $gte: startDate },
      paymentStatus: 'PAID'
    });

    const itemStats = {};

    bills.forEach(bill => {
      bill.items.forEach(item => {
        if (!itemStats[item.name]) {
          itemStats[item.name] = {
            name: item.name,
            quantity: 0,
            revenue: 0,
            gst: 0,
            averagePrice: 0,
            soldCount: 0
          };
        }
        itemStats[item.name].quantity += item.quantity;
        itemStats[item.name].revenue += item.itemTotal || 0;
        itemStats[item.name].gst += 0;
        itemStats[item.name].soldCount += 1;
      });
    });

    // Calculate averages and sort by revenue
    const items = Object.values(itemStats)
      .map(item => ({
        ...item,
        averagePrice: (item.revenue / item.quantity).toFixed(2),
        margin: ((item.revenue / item.quantity) * 0.7).toFixed(2) // Rough estimate
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      period: `Last ${days} days`,
      items,
      topItems: items.slice(0, 10),
      bottomItems: items.slice(-5).reverse()
    };
  }

  /**
   * Get table efficiency metrics
   */
  static async getTableMetrics(restaurantId) {
    const orders = await Order.find({
      restaurantId,
      createdAt: {
        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
      }
    }).populate('tableId');

    const tableMetrics = {};

    orders.forEach(order => {
      const tableNum = order.tableNumber || 'Unknown';
      if (!tableMetrics[tableNum]) {
        tableMetrics[tableNum] = {
          table: tableNum,
          totalOrders: 0,
          totalRevenue: 0,
          averageOrderValue: 0,
          averagePrepTime: 0,
          turnover: 0
        };
      }

      tableMetrics[tableNum].totalOrders += 1;
      tableMetrics[tableNum].totalRevenue += order.totalAmount || 0;

      if (order.completedAt && order.placedAt) {
        const prepTime = (order.completedAt - order.placedAt) / 1000 / 60;
        tableMetrics[tableNum].averagePrepTime += prepTime;
      }
    });

    // Calculate averages
    const tables = Object.values(tableMetrics).map(table => ({
      ...table,
      averageOrderValue: (table.totalRevenue / table.totalOrders).toFixed(2),
      averagePrepTime: (table.averagePrepTime / table.totalOrders).toFixed(2),
      turnover: table.totalOrders
    }));

    return {
      period: 'Last 30 days',
      tables: tables.sort((a, b) => b.totalRevenue - a.totalRevenue),
      summary: {
        totalTables: tables.length,
        averageTableRevenue: (
          tables.reduce((sum, t) => sum + t.totalRevenue, 0) / tables.length
        ).toFixed(2)
      }
    };
  }

  /**
   * Get payment mode breakdown
   */
  static getPaymentBreakdown(bills) {
    const breakdown = {};

    bills.forEach(bill => {
      const mode = bill.paymentMode || 'CASH';
      if (!breakdown[mode]) {
        breakdown[mode] = { mode, count: 0, amount: 0 };
      }
      breakdown[mode].count += 1;
      breakdown[mode].amount += bill.totalAmount || 0;
    });

    return Object.values(breakdown);
  }

  /**
   * Get comprehensive dashboard summary
   */
  static async getDashboardSummary(restaurantId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailySales = await this.getDailySales(restaurantId, today);
    const monthSales = await this.getMonthlyRevenue(
      restaurantId,
      today.getFullYear(),
      today.getMonth() + 1
    );
    const topItems = await this.getItemWiseSales(restaurantId, 30);
    const tableMetrics = await this.getTableMetrics(restaurantId);

    // Get pending orders
    const pendingOrders = await Order.find({
      restaurantId,
      status: { $in: ['OPEN', 'PENDING_PAYMENT'] }
    });

    return {
      date: today.toISOString().split('T')[0],
      today: {
        sales: dailySales.totalSales,
        orders: dailySales.billCount,
        gst: dailySales.totalGST,
        averageOrderValue: dailySales.averageBillValue
      },
      thisMonth: {
        sales: monthSales.totalSales,
        orders: monthSales.totalBills,
        days: monthSales.dailyBreakdown.length
      },
      topItems: topItems.topItems.slice(0, 5),
      topTables: tableMetrics.tables.slice(0, 5),
      pendingOrders: pendingOrders.length,
      metrics: {
        daySalesTarget: 50000, // Can be configurable
        dayTarget: 100 // Can be configurable
      }
    };
  }

  /**
   * Get profit and cost analysis
   */
  static async getProfitAnalysis(restaurantId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const bills = await Bill.find({
      restaurantId,
      createdAt: { $gte: startDate },
      paymentStatus: 'PAID'
    });

    let totalRevenue = 0;
    let totalGST = 0;
    let totalDiscount = 0;

    bills.forEach(bill => {
      totalRevenue += bill.totalAmount || 0;
      totalGST += bill.tax || 0;
      totalDiscount += bill.discount || 0;
    });

    // Assuming 60% COGS (Cost of Goods Sold)
    const estimatedCogs = totalRevenue * 0.6;
    const grossProfit = totalRevenue - estimatedCogs;
    const grossMargin = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(2) : 0;

    return {
      period: `Last ${days} days`,
      totalRevenue,
      totalGST,
      totalDiscount,
      estimatedCogs,
      grossProfit,
      grossMargin: `${grossMargin}%`,
      billCount: bills.length
    };
  }
}

module.exports = ReportingService;
