const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const Subscription = require('../models/Subscription');
const { getSecretManager } = require('../middleware/jwtSecretManager');

// Generate JWT Token using Secret Manager for rotation support
const generateToken = (id, restaurantId) => {
  const secretManager = getSecretManager();
  return secretManager.signJWT(
    { id, restaurantId },
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// @desc    Register restaurant and owner
// @route   POST /api/auth/signup
// @access  Public
exports.signup = async (req, res) => {
  try {
    const {
      restaurantName,
      ownerName,
      email,
      phone,
      password,
      address
    } = req.body;

    // Check if restaurant already exists
    const existingRestaurant = await Restaurant.findOne({ email });
    if (existingRestaurant) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant with this email already exists'
      });
    }

    // Calculate trial period expiry
    const trialDays = parseInt(process.env.TRIAL_PERIOD_DAYS) || 7;
    const subscriptionExpiry = new Date();
    subscriptionExpiry.setDate(subscriptionExpiry.getDate() + trialDays);

    // Create restaurant
    const restaurant = await Restaurant.create({
      name: restaurantName,
      ownerName,
      email,
      phone,
      address,
      subscriptionStatus: 'TRIAL',
      subscriptionExpiry
    });

    // Create trial subscription record
    await Subscription.create({
      restaurantId: restaurant._id,
      planName: 'TRIAL',
      amount: 0,
      startDate: new Date(),
      endDate: subscriptionExpiry,
      status: 'ACTIVE'
    });

    // Create owner user
    const user = await User.create({
      name: ownerName,
      email,
      phone,
      password,
      role: 'OWNER',
      restaurantId: restaurant._id
    });

    // Generate token
    const token = generateToken(user._id, restaurant._id);

    res.status(201).json({
      success: true,
      message: 'Restaurant registered successfully',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          restaurantId: user.restaurantId
        },
        restaurant: {
          id: restaurant._id,
          _id: restaurant._id,
          name: restaurant.name,
          logo: restaurant.logo,
          subscriptionStatus: restaurant.subscriptionStatus,
          subscriptionExpiry: restaurant.subscriptionExpiry
        }
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error during registration'
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Find user with password field
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Check password
    const isPasswordMatch = await user.comparePassword(password);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Get restaurant details
    const restaurant = await Restaurant.findById(user.restaurantId);

    if (!restaurant || !restaurant.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Restaurant not found or inactive'
      });
    }

    // Generate token
    const token = generateToken(user._id, restaurant._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          restaurantId: user.restaurantId
        },
        restaurant: {
          id: restaurant._id,
          _id: restaurant._id,
          name: restaurant.name,
          logo: restaurant.logo,
          subscriptionStatus: restaurant.subscriptionStatus,
          subscriptionExpiry: restaurant.subscriptionExpiry
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during login'
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    // Use select('-password') to ensure password is never returned
    const user = await User.findById(req.user.id).select('-password');
    const restaurant = await Restaurant.findById(user.restaurantId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user: user.toObject(), // Ensure password field is removed
        restaurant
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user data'
    });
  }
};

// @desc    Extend trial period (admin/development use)
// @route   POST /api/auth/extend-trial
// @access  Private
exports.extendTrial = async (req, res) => {
  try {
    const { days = 7 } = req.body;
    
    const restaurant = await Restaurant.findById(req.user.restaurantId);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    // Extend trial by specified days
    const newExpiry = new Date(restaurant.subscriptionExpiry);
    newExpiry.setDate(newExpiry.getDate() + days);

    restaurant.subscriptionExpiry = newExpiry;
    restaurant.subscriptionStatus = 'TRIAL';
    await restaurant.save();

    res.status(200).json({
      success: true,
      message: `Trial extended by ${days} days`,
      data: {
        subscriptionStatus: restaurant.subscriptionStatus,
        subscriptionExpiry: restaurant.subscriptionExpiry
      }
    });
  } catch (error) {
    console.error('Extend trial error:', error);
    res.status(500).json({
      success: false,
      message: 'Error extending trial'
    });
  }
};
