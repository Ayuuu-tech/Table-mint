const express = require('express');
const router = express.Router();
const {
  getTodaySales,
  getSalesByDateRange,
  getItemWiseSales,
  getMonthlyRevenue,
  getDashboardSummary,
  getGSTR1Report,
  getTaxRateReport,
  getGSTR3BReport,
  downloadGSTR3BPDF,
  getYearEndReport,
  downloadYearEndPDF
} = require('../controllers/reportController');
const { protect, authorize, checkSubscription } = require('../middleware/auth');

router.get('/today', protect, checkSubscription, getTodaySales);
router.get('/sales', protect, authorize('OWNER'), checkSubscription, getSalesByDateRange);
router.get('/items', protect, authorize('OWNER'), checkSubscription, getItemWiseSales);
router.get('/monthly-revenue', protect, authorize('OWNER'), checkSubscription, getMonthlyRevenue);
router.get('/dashboard', protect, checkSubscription, getDashboardSummary);
router.get('/gstr1', protect, authorize('OWNER'), checkSubscription, getGSTR1Report);
router.get('/tax-sales', protect, authorize('OWNER'), checkSubscription, getTaxRateReport);

// GSTR-3B Routes
router.get('/gstr3b', protect, authorize('OWNER'), checkSubscription, getGSTR3BReport);
router.get('/gstr3b/pdf', protect, authorize('OWNER'), checkSubscription, downloadGSTR3BPDF);

// Year-End Financial Report Routes
router.get('/year-end', protect, authorize('OWNER'), checkSubscription, getYearEndReport);
router.get('/year-end/pdf', protect, authorize('OWNER'), checkSubscription, downloadYearEndPDF);

module.exports = router;

