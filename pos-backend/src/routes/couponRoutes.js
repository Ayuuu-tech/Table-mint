const express = require('express');
const router = express.Router();
const {
  createCoupon,
  getCoupons,
  validateCoupon,
  updateCoupon,
  deleteCoupon,
  applyCoupon
} = require('../controllers/couponController');
const { protect } = require('../middleware/auth');
const { checkActiveSubscription } = require('../middleware/subscriptionCheck');

router.use(protect);
router.use(checkActiveSubscription);

router.route('/')
  .get(getCoupons)
  .post(createCoupon);

router.get('/validate/:code', validateCoupon);

router.route('/:id')
  .put(updateCoupon)
  .delete(deleteCoupon);

router.post('/:id/apply', applyCoupon);

module.exports = router;
