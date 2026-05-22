const Razorpay = require('razorpay');
const crypto = require('crypto');
const Subscription = require('../models/Subscription');
const Restaurant = require('../models/Restaurant');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Subscription plans
const PLANS = {
  MONTHLY: { amount: 999, duration: 30 },
  QUARTERLY: { amount: 2499, duration: 90 },
  YEARLY: { amount: 8999, duration: 365 }
};

// @desc    Get subscription plans
// @route   GET /api/subscriptions/plans
// @access  Public
exports.getPlans = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: PLANS
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching plans'
    });
  }
};

// @desc    Get current subscription
// @route   GET /api/subscriptions/current
// @access  Private
exports.getCurrentSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      restaurantId: req.user.restaurantId,
      status: 'ACTIVE'
    }).sort({ createdAt: -1 });

    const restaurant = await Restaurant.findById(req.user.restaurantId);

    res.status(200).json({
      success: true,
      data: {
        subscription,
        restaurant: {
          subscriptionStatus: restaurant.subscriptionStatus,
          subscriptionExpiry: restaurant.subscriptionExpiry
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching subscription'
    });
  }
};

// @desc    Create Razorpay order for subscription
// @route   POST /api/subscriptions/create-order
// @access  Private
exports.createSubscriptionOrder = async (req, res) => {
  try {
    const { planName } = req.body;

    if (!PLANS[planName]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan selected'
      });
    }

    const plan = PLANS[planName];

    const options = {
      amount: plan.amount * 100, // amount in paise
      currency: 'INR',
      receipt: `sub_${req.user.restaurantId}_${Date.now()}`,
      notes: {
        restaurantId: req.user.restaurantId.toString(),
        planName
      }
    };

    const order = await razorpay.orders.create(options);

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error('Razorpay order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating subscription order'
    });
  }
};

// @desc    Verify payment and activate subscription
// @route   POST /api/subscriptions/verify-payment
// @access  Private
exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      planName
    } = req.body;

    // Verify signature
    const body = razorpayOrderId + '|' + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Get plan details
    const plan = PLANS[planName];

    // Calculate dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.duration);

    // Create subscription record
    const subscription = await Subscription.create({
      restaurantId: req.user.restaurantId,
      planName,
      amount: plan.amount,
      startDate,
      endDate,
      status: 'ACTIVE',
      paymentDetails: {
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        paidAmount: plan.amount,
        paidAt: new Date()
      }
    });

    // Update restaurant subscription status
    await Restaurant.findByIdAndUpdate(req.user.restaurantId, {
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiry: endDate
    });

    res.status(200).json({
      success: true,
      message: 'Subscription activated successfully',
      data: subscription
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying payment'
    });
  }
};

// @desc    Get subscription history
// @route   GET /api/subscriptions/history
// @access  Private
exports.getSubscriptionHistory = async (req, res) => {
  try {
    const subscriptions = await Subscription.find({
      restaurantId: req.user.restaurantId
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: subscriptions.length,
      data: subscriptions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching subscription history'
    });
  }
};
