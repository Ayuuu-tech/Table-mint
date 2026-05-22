const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ReportingService = require('../services/reportingService');
const Bill = require('../models/Bill');
const exportHelper = require('../utils/exportHelper');
const analyticsController = require('../controllers/analyticsController');

/**
 * Advanced Analytics and Reports Routes
 * All routes require authentication and OWNER role
 */

// GET /api/analytics/charts?period=daily|weekly|monthly
router.get('/charts', protect, authorize('OWNER'), analyticsController.getChartData);

// ====== SALES REPORTS ======

/**
 * GET /api/analytics/daily-sales?date=YYYY-MM-DD
 * Get sales for specific date
 */
router.get('/daily-sales', protect, authorize('OWNER'), async (req, res) => {
  try {
    const { date } = req.query;
    const queryDate = date ? new Date(date) : new Date();

    const sales = await ReportingService.getDailySales(req.user.restaurantId, queryDate);

    res.status(200).json({
      success: true,
      data: sales
    });
  } catch (error) {
    console.error('Daily sales report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching daily sales report'
    });
  }
});

/**
 * GET /api/analytics/monthly-revenue?year=2026&month=1
 * Get monthly revenue with daily breakdown
 */
router.get('/monthly-revenue', protect, authorize('OWNER'), async (req, res) => {
  try {
    const { year, month } = req.query;
    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;

    const revenue = await ReportingService.getMonthlyRevenue(
      req.user.restaurantId,
      currentYear,
      currentMonth
    );

    res.status(200).json({
      success: true,
      data: revenue
    });
  } catch (error) {
    console.error('Monthly revenue report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching monthly revenue report'
    });
  }
});

// ====== ITEM PERFORMANCE ======

/**
 * GET /api/analytics/item-wise-sales?days=30
 * Get top selling items
 */
router.get('/item-wise-sales', protect, authorize('OWNER'), async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const itemSales = await ReportingService.getItemWiseSales(
      req.user.restaurantId,
      parseInt(days)
    );

    res.status(200).json({
      success: true,
      data: itemSales
    });
  } catch (error) {
    console.error('Item-wise sales report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching item-wise sales report'
    });
  }
});

// ====== TABLE EFFICIENCY ======

/**
 * GET /api/analytics/table-metrics
 * Get table efficiency and performance metrics
 */
router.get('/table-metrics', protect, authorize('OWNER'), async (req, res) => {
  try {
    const metrics = await ReportingService.getTableMetrics(req.user.restaurantId);

    res.status(200).json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Table metrics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching table metrics'
    });
  }
});

// ====== PROFIT ANALYSIS ======

/**
 * GET /api/analytics/profit?days=30
 * Get profit and cost analysis
 */
router.get('/profit', protect, authorize('OWNER'), async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const profitData = await ReportingService.getProfitAnalysis(
      req.user.restaurantId,
      parseInt(days)
    );

    res.status(200).json({
      success: true,
      data: profitData
    });
  } catch (error) {
    console.error('Profit analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profit analysis'
    });
  }
});

// ====== DASHBOARD SUMMARY ======

/**
 * GET /api/analytics/dashboard-summary
 * Get comprehensive dashboard summary
 */
router.get('/dashboard-summary', protect, authorize('OWNER'), async (req, res) => {
  try {
    const summary = await ReportingService.getDashboardSummary(req.user.restaurantId);

    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard summary'
    });
  }
});

// ====== EXPORT REPORTS ======

/**
 * GET /api/analytics/export?type=daily-sales&format=csv&date=YYYY-MM-DD
 * Export reports in CSV/PDF format
 */
router.get('/export', protect, authorize('OWNER'), async (req, res) => {
  try {
    const { type = 'daily-sales', format = 'csv', date } = req.query;
    const queryDate = date ? new Date(date) : new Date();

    let data, formattedData, filename;

    switch (type) {
      case 'daily-sales':
        // Get daily sales data
        queryDate.setHours(0, 0, 0, 0);
        const endOfDay = new Date(queryDate);
        endOfDay.setHours(23, 59, 59, 999);

        const bills = await Bill.find({
          restaurantId: req.user.restaurantId,
          createdAt: { $gte: queryDate, $lte: endOfDay },
          paymentStatus: 'PAID'
        }).sort({ createdAt: -1 });

        if (!bills || bills.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'No sales data found for the specified date'
          });
        }

        formattedData = exportHelper.formatDailySalesData(bills);
        filename = `daily-sales-${queryDate.toISOString().split('T')[0]}`;
        break;

      case 'monthly-revenue':
        const year = queryDate.getFullYear();
        const month = queryDate.getMonth() + 1;
        const revenueData = await ReportingService.getMonthlyRevenue(
          req.user.restaurantId,
          year,
          month
        );
        formattedData = exportHelper.formatMonthlyRevenueData(revenueData.dailyBreakdown);
        filename = `monthly-revenue-${year}-${month}`;
        break;

      case 'item-wise-sales':
        const itemSales = await ReportingService.getItemWiseSales(req.user.restaurantId, 30);
        formattedData = exportHelper.formatItemWiseSalesData(itemSales);
        filename = `item-wise-sales`;
        break;

      case 'table-metrics':
        const tableMetrics = await ReportingService.getTableMetrics(req.user.restaurantId);
        formattedData = exportHelper.formatTableMetricsData(tableMetrics.tables);
        filename = `table-metrics`;
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid report type'
        });
    }

    if (format === 'csv') {
      // Generate CSV
      if (!formattedData || formattedData.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No data available to export'
        });
      }

      const fields = Object.keys(formattedData[0] || {});
      const csv = exportHelper.generateCSV(formattedData, fields);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send(csv);
    } else if (format === 'pdf') {
      // Generate PDF
      if (!formattedData || formattedData.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No data available to export'
        });
      }

      await exportHelper.generatePDF(filename.replace(/-/g, ' ').toUpperCase(), formattedData, res);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid format. Use csv or pdf'
      });
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting report'
    });
  }
});

module.exports = router;
