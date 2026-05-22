/**
 * Subscription Enforcement Middleware
 * 
 * Blocks access to POS and Dashboard if:
 * 1. Subscription is EXPIRED
 * 2. Subscription is CANCELLED
 * 3. Payment is PENDING
 * 
 * Should be applied to protected routes
 */

const Restaurant = require('../models/Restaurant');
const Subscription = require('../models/Subscription');

/**
 * Verify subscription is active
 * Can be used as middleware or standalone function
 */
const checkActiveSubscription = async (req, res, next) => {
  try {
    const restaurantId = req.user.restaurantId || req.body.restaurantId;

    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID is required'
      });
    }

    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    const subscription = await Subscription.findOne({ restaurantId });

    // Check subscription status
    if (!subscription) {
      return res.status(402).json({
        success: false,
        message: 'No active subscription. Please subscribe to continue.',
        requiresSubscription: true
      });
    }

    // Check if expired
    if (subscription.status === 'EXPIRED') {
      return res.status(402).json({
        success: false,
        message: 'Your subscription has expired. Please renew to continue.',
        subscriptionExpired: true,
        expiryDate: subscription.endDate
      });
    }

    // Check if cancelled
    if (subscription.status === 'CANCELLED') {
      return res.status(402).json({
        success: false,
        message: 'Your subscription has been cancelled. Please reactivate.',
        subscriptionCancelled: true
      });
    }

    // Check if payment pending
    if (subscription.status === 'PENDING_PAYMENT') {
      return res.status(402).json({
        success: false,
        message: 'Payment pending. Please complete payment to access POS.',
        paymentPending: true
      });
    }

    // Check actual expiry date
    if (new Date(subscription.endDate) < new Date()) {
      subscription.status = 'EXPIRED';
      await subscription.save();

      return res.status(402).json({
        success: false,
        message: 'Your subscription has expired. Please renew.',
        subscriptionExpired: true
      });
    }

    // Subscription is valid
    req.subscription = subscription;
    req.restaurant = restaurant;
    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying subscription'
    });
  }
};

/**
 * Block POS access if subscription expired
 * Used specifically for POS routes
 */
const checkPOSAccess = async (req, res, next) => {
  try {
    const restaurantId = req.user.restaurantId;

    if (!restaurantId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const subscription = await Subscription.findOne({
      restaurantId,
      status: { $in: ['ACTIVE', 'TRIAL'] }
    });

    if (!subscription) {
      return res.status(402).json({
        success: false,
        message: 'POS access requires active subscription',
        requiresPayment: true
      });
    }

    // Check expiry
    if (new Date(subscription.endDate) < new Date()) {
      return res.status(402).json({
        success: false,
        message: 'POS access expired. Please renew subscription.',
        subscriptionExpired: true
      });
    }

    next();
  } catch (error) {
    console.error('POS access check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking POS access'
    });
  }
};

/**
 * Warn when subscription is about to expire
 */
const checkSubscriptionExpiry = async (req, res, next) => {
  try {
    const restaurantId = req.user.restaurantId;
    const subscription = await Subscription.findOne({
      restaurantId,
      status: { $in: ['ACTIVE', 'TRIAL'] }
    });

    if (subscription) {
      const daysRemaining = Math.ceil(
        (new Date(subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24)
      );

      // Warn if less than 7 days remaining
      if (daysRemaining <= 7 && daysRemaining > 0) {
        req.subscriptionWarning = {
          daysRemaining,
          expiryDate: subscription.endDate,
          message: `Your subscription expires in ${daysRemaining} days`
        };
      }

      // Block if already expired
      if (daysRemaining <= 0) {
        subscription.status = 'EXPIRED';
        await subscription.save();

        return res.status(402).json({
          success: false,
          message: 'Subscription expired',
          subscriptionExpired: true
        });
      }
    }

    next();
  } catch (error) {
    console.error('Subscription expiry check error:', error);
    next(); // Don't block on error
  }
};

/**
 * Get subscription info for response
 */
const getSubscriptionInfo = async (restaurantId) => {
  try {
    const subscription = await Subscription.findOne({ restaurantId });

    if (!subscription) {
      return null;
    }

    const daysRemaining = Math.ceil(
      (new Date(subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24)
    );

    return {
      status: subscription.status,
      plan: subscription.plan,
      daysRemaining: Math.max(0, daysRemaining),
      expiryDate: subscription.endDate,
      autoRenew: subscription.autoRenew
    };
  } catch (error) {
    console.error('Error getting subscription info:', error);
    return null;
  }
};

module.exports = {
  checkActiveSubscription,
  checkPOSAccess,
  checkSubscriptionExpiry,
  getSubscriptionInfo
};
