const Bill = require('../models/Bill');
const Order = require('../models/Order');
const ReportingService = require('../services/reportingService');

// @desc    Get chart data for analytics
// @route   GET /api/analytics/charts
// @access  Private (Owner)
exports.getChartData = async (req, res) => {
  try {
    const { period = 'daily', startDate, endDate } = req.query;
    const restaurantId = req.user.restaurantId;

    let start, end;
    const now = new Date();

    // Determine date range based on period
    switch (period) {
      case 'daily':
        // Last 7 days
        start = new Date(now);
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
        break;
      case 'weekly':
        // Last 4 weeks
        start = new Date(now);
        start.setDate(start.getDate() - 27);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
        break;
      case 'monthly':
        // Last 6 months
        start = new Date(now);
        start.setMonth(start.getMonth() - 5);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
        break;
      default:
        if (startDate && endDate) {
          start = new Date(startDate);
          end = new Date(endDate);
        } else {
          start = new Date(now);
          start.setDate(start.getDate() - 6);
          end = now;
        }
    }

    // Fetch bills for the period
    const bills = await Bill.find({
      restaurantId,
      createdAt: { $gte: start, $lte: end }
    }).sort({ createdAt: 1 });

    // Generate chart data based on period
    let chartData = [];

    if (period === 'daily') {
      // Group by day
      for (let i = 0; i < 7; i++) {
        const day = new Date(start);
        day.setDate(day.getDate() + i);
        const dayStart = new Date(day);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(23, 59, 59, 999);

        const dayBills = bills.filter(
          (b) => b.createdAt >= dayStart && b.createdAt <= dayEnd
        );

        const revenue = dayBills.reduce((sum, b) => sum + b.totalAmount, 0);
        const orders = dayBills.length;
        const avgOrder = orders > 0 ? revenue / orders : 0;

        chartData.push({
          date: day.toISOString().split('T')[0],
          label: day.toLocaleDateString('en-US', { weekday: 'short' }),
          revenue: parseFloat(revenue.toFixed(2)),
          orders,
          avgOrder: parseFloat(avgOrder.toFixed(2)),
        });
      }
    } else if (period === 'weekly') {
      // Group by week
      for (let i = 0; i < 4; i++) {
        const weekStart = new Date(start);
        weekStart.setDate(weekStart.getDate() + i * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const weekBills = bills.filter(
          (b) => b.createdAt >= weekStart && b.createdAt <= weekEnd
        );

        const revenue = weekBills.reduce((sum, b) => sum + b.totalAmount, 0);
        const orders = weekBills.length;
        const avgOrder = orders > 0 ? revenue / orders : 0;

        chartData.push({
          date: weekStart.toISOString().split('T')[0],
          label: `Week ${i + 1}`,
          revenue: parseFloat(revenue.toFixed(2)),
          orders,
          avgOrder: parseFloat(avgOrder.toFixed(2)),
        });
      }
    } else if (period === 'monthly') {
      // Group by month
      for (let i = 0; i < 6; i++) {
        const monthDate = new Date(start);
        monthDate.setMonth(monthDate.getMonth() + i);
        const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
        const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);

        const monthBills = bills.filter(
          (b) => b.createdAt >= monthStart && b.createdAt <= monthEnd
        );

        const revenue = monthBills.reduce((sum, b) => sum + b.totalAmount, 0);
        const orders = monthBills.length;
        const avgOrder = orders > 0 ? revenue / orders : 0;

        chartData.push({
          date: monthStart.toISOString().split('T')[0],
          label: monthStart.toLocaleDateString('en-US', { month: 'short' }),
          revenue: parseFloat(revenue.toFixed(2)),
          orders,
          avgOrder: parseFloat(avgOrder.toFixed(2)),
        });
      }
    }

    // Calculate totals and trends
    const totalRevenue = bills.reduce((sum, b) => sum + b.totalAmount, 0);
    const totalOrders = bills.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    res.status(200).json({
      success: true,
      data: {
        period,
        startDate: start,
        endDate: end,
        chartData,
        summary: {
          totalRevenue: parseFloat(totalRevenue.toFixed(2)),
          totalOrders,
          avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
        },
      },
    });
  } catch (error) {
    console.error('Chart data error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching chart data',
    });
  }
};
