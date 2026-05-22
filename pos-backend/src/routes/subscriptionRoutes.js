const express = require('express');
const router = express.Router();
const {
  getPlans,
  getCurrentSubscription,
  createSubscriptionOrder,
  verifyPayment,
  getSubscriptionHistory
} = require('../controllers/subscriptionController');
const { protect, authorize } = require('../middleware/auth');

router.get('/plans', getPlans);
router.get('/current', protect, getCurrentSubscription);
router.post('/create-order', protect, authorize('OWNER'), createSubscriptionOrder);
router.post('/verify-payment', protect, authorize('OWNER'), verifyPayment);
router.get('/history', protect, authorize('OWNER'), getSubscriptionHistory);

module.exports = router;
