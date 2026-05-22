const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const { getSecretManager } = require('./jwtSecretManager');

// Protect routes - verify JWT token
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    try {
      // Verify token using secret manager (supports rotation)
      const secretManager = getSecretManager();
      const decoded = secretManager.verifyJWT(token);

      // Get user without password field
      req.user = await User.findById(decoded.id).select('-password');
      
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      next();
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Token is invalid or expired'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

// Check if user has specific role
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role ${req.user.role} is not authorized to access this route`
      });
    }
    next();
  };
};

// Check subscription status
exports.checkSubscription = async (req, res, next) => {
  try {
    const restaurant = await Restaurant.findById(req.user.restaurantId);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    // Check if subscription is active or in trial
    const now = new Date();
    
    // Allow access for ACTIVE subscriptions or TRIAL that hasn't expired
    if (restaurant.subscriptionStatus === 'ACTIVE') {
      req.restaurant = restaurant;
      return next();
    }

    if (restaurant.subscriptionStatus === 'TRIAL' && 
        restaurant.subscriptionExpiry && 
        restaurant.subscriptionExpiry > now) {
      req.restaurant = restaurant;
      return next();
    }

    // If subscription is expired, update status and deny access
    if (restaurant.subscriptionExpiry && restaurant.subscriptionExpiry < now) {
      restaurant.subscriptionStatus = 'EXPIRED';
      await restaurant.save();
      
      return res.status(403).json({
        success: false,
        message: 'Subscription expired. Please renew to continue.',
        subscriptionStatus: 'EXPIRED',
        expiryDate: restaurant.subscriptionExpiry
      });
    }

    // Deny access for explicitly cancelled subscriptions
    if (restaurant.subscriptionStatus === 'CANCELLED') {
      return res.status(403).json({
        success: false,
        message: 'Subscription has been cancelled.',
        subscriptionStatus: 'CANCELLED'
      });
    }

    // Default: allow access (fallback for legacy data)
    req.restaurant = restaurant;
    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking subscription status'
    });
  }
};
