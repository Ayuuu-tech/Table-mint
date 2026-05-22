const express = require('express');
const router = express.Router();
const {
  exportCustomersCSV,
  getCustomerStats,
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  updateLoyaltyPoints,
  getUpcomingCelebrations,
  handleWalletTransaction
} = require('../controllers/customerController');
const { protect, authorize } = require('../middleware/auth');

router.get('/', protect, getCustomers);
router.post('/', protect, authorize('OWNER', 'MANAGER', 'CASHIER'), createCustomer);
router.get('/highlights/upcoming', protect, getUpcomingCelebrations);
router.get('/export', protect, authorize('OWNER'), exportCustomersCSV);
router.get('/stats', protect, authorize('OWNER'), getCustomerStats);
router.get('/:id', protect, getCustomerById);
router.put('/:id', protect, authorize('OWNER', 'MANAGER', 'CASHIER'), updateCustomer);
router.post('/:id/loyalty', protect, authorize('OWNER', 'MANAGER', 'CASHIER'), updateLoyaltyPoints);
router.post('/:id/wallet', protect, authorize('OWNER', 'MANAGER', 'CASHIER'), handleWalletTransaction);

module.exports = router;
