const express = require('express');
const router = express.Router();
const {
  generateBill,
  getBills,
  getBill,
  getBillByNumber,
  reportFailedPayment,
  generatePaymentQR,
  downloadInvoicePDF,
  getInvoicePDFPreview
} = require('../controllers/billController');
const splitBillController = require('../controllers/splitBillController');
const { protect, checkSubscription } = require('../middleware/auth');

router.post('/', protect, checkSubscription, generateBill);
router.post('/qr', protect, checkSubscription, generatePaymentQR);
router.post('/failed-payment', protect, checkSubscription, reportFailedPayment);
router.get('/', protect, checkSubscription, getBills);
router.get('/:id', protect, checkSubscription, getBill);
router.get('/number/:billNumber', protect, checkSubscription, getBillByNumber);

// PDF Invoice routes
router.get('/:id/pdf', protect, checkSubscription, downloadInvoicePDF);
router.get('/:id/pdf/preview', protect, checkSubscription, getInvoicePDFPreview);

// Split bill routes
router.post('/:id/split', protect, checkSubscription, splitBillController.splitBill);
router.get('/:id/split/:splitIndex', protect, checkSubscription, splitBillController.getSplitBill);
router.patch('/:id/split/:splitIndex/pay', protect, checkSubscription, splitBillController.updateSplitPayment);

module.exports = router;

