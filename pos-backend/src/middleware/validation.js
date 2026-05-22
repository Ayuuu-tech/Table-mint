/**
 * Input Validation Middleware
 * Comprehensive validation rules for all API endpoints using express-validator
 * 
 * Usage:
 * const { tableValidation, handleValidationErrors } = require('../middleware/validation');
 * router.post('/tables', tableValidation.create, handleValidationErrors, createTable);
 */

const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');

// ==================== VALIDATION ERROR HANDLER ====================

/**
 * Handle validation errors and return formatted response
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errorCode: 'VALIDATION_ERROR',
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value,
        location: err.location
      }))
    });
  }
  next();
};

// ==================== COMMON VALIDATORS ====================

/**
 * Common validation helpers
 */
const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const isValidPhone = (value) => /^[6-9]\d{9}$/.test(value); // Indian mobile
const isValidGST = (value) => /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d[Z][A-Z\d]$/.test(value);
const isValidPincode = (value) => /^\d{6}$/.test(value);

// ==================== AUTHENTICATION VALIDATION ====================

const authValidation = {
  signup: [
    body('restaurantName')
      .trim()
      .notEmpty().withMessage('Restaurant name is required')
      .isLength({ min: 2, max: 100 }).withMessage('Restaurant name must be 2-100 characters')
      .matches(/^[a-zA-Z0-9\s&'"-]+$/).withMessage('Restaurant name contains invalid characters'),

    body('ownerName')
      .trim()
      .notEmpty().withMessage('Owner name is required')
      .isLength({ min: 2, max: 50 }).withMessage('Owner name must be 2-50 characters')
      .matches(/^[a-zA-Z\s'-]+$/).withMessage('Owner name can only contain letters, spaces, hyphens'),

    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Invalid email format')
      .normalizeEmail()
      .isLength({ max: 100 }).withMessage('Email too long'),

    body('password')
      .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
      .isLength({ max: 128 }).withMessage('Password too long'),

    body('phone')
      .trim()
      .notEmpty().withMessage('Phone number is required')
      .custom(isValidPhone).withMessage('Invalid Indian mobile number (10 digits starting with 6-9)'),

    body('address.street')
      .optional()
      .trim()
      .isLength({ max: 200 }).withMessage('Street address too long'),

    body('address.city')
      .optional()
      .trim()
      .isLength({ max: 50 }).withMessage('City name too long'),

    body('address.state')
      .optional()
      .trim()
      .isLength({ max: 50 }).withMessage('State name too long'),

    body('address.pincode')
      .optional()
      .custom((val) => !val || isValidPincode(val)).withMessage('Invalid pincode (6 digits)')
  ],

  login: [
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Invalid email format')
      .normalizeEmail(),

    body('password')
      .notEmpty().withMessage('Password is required')
  ]
};

// ==================== MENU ITEM VALIDATION ====================

const menuValidation = {
  create: [
    body('name')
      .trim()
      .notEmpty().withMessage('Item name is required')
      .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),

    body('price')
      .notEmpty().withMessage('Price is required')
      .isFloat({ min: 0.01, max: 100000 }).withMessage('Price must be between ₹0.01 and ₹1,00,000'),

    body('category')
      .trim()
      .notEmpty().withMessage('Category is required')
      .isIn(['STARTERS', 'MAIN_COURSE', 'BREADS', 'RICE', 'BEVERAGES', 'DESSERTS', 'CHINESE', 'SOUTH_INDIAN', 'OTHER'])
      .withMessage('Invalid category'),

    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Description too long (max 500 characters)'),

    body('taxRate')
      .optional()
      .isIn([0, 5, 12, 18, 28]).withMessage('Tax rate must be 0, 5, 12, 18, or 28%'),

    body('hsnCode')
      .optional()
      .trim()
      .matches(/^\d{4,8}$/).withMessage('HSN code must be 4-8 digits'),

    body('isVeg')
      .optional()
      .isBoolean().withMessage('isVeg must be true or false'),

    body('isAvailable')
      .optional()
      .isBoolean().withMessage('isAvailable must be true or false'),

    body('preparationTime')
      .optional()
      .isInt({ min: 1, max: 180 }).withMessage('Preparation time must be 1-180 minutes'),

    body('hasVariants')
      .optional()
      .isBoolean().withMessage('hasVariants must be true or false'),

    body('variants')
      .optional()
      .isArray().withMessage('Variants must be an array'),

    body('variants.*.name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 }).withMessage('Variant name must be 1-50 characters'),

    body('variants.*.price')
      .optional()
      .isFloat({ min: 0 }).withMessage('Variant price must be positive'),

    body('modifierGroups')
      .optional()
      .isArray().withMessage('Modifier groups must be an array'),

    body('modifierGroups.*.name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 }).withMessage('Modifier group name must be 1-50 characters')
  ],

  update: [
    param('id')
      .custom(isValidObjectId).withMessage('Invalid menu item ID'),

    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),

    body('price')
      .optional()
      .isFloat({ min: 0.01, max: 100000 }).withMessage('Price must be between ₹0.01 and ₹1,00,000'),

    body('category')
      .optional()
      .trim()
      .isIn(['STARTERS', 'MAIN_COURSE', 'BREADS', 'RICE', 'BEVERAGES', 'DESSERTS', 'CHINESE', 'SOUTH_INDIAN', 'OTHER'])
      .withMessage('Invalid category')
  ]
};

// ==================== TABLE VALIDATION ====================

const tableValidation = {
  create: [
    body('tableNumber')
      .trim()
      .notEmpty().withMessage('Table number is required')
      .isLength({ min: 1, max: 20 }).withMessage('Table number must be 1-20 characters')
      .matches(/^[A-Za-z0-9-]+$/).withMessage('Table number can only contain letters, numbers, and hyphens'),

    body('capacity')
      .notEmpty().withMessage('Capacity is required')
      .isInt({ min: 1, max: 50 }).withMessage('Capacity must be between 1 and 50'),

    body('section')
      .optional()
      .trim()
      .isLength({ max: 50 }).withMessage('Section name too long')
  ],

  update: [
    param('id')
      .custom(isValidObjectId).withMessage('Invalid table ID'),

    body('tableNumber')
      .optional()
      .trim()
      .isLength({ min: 1, max: 20 }).withMessage('Table number must be 1-20 characters'),

    body('capacity')
      .optional()
      .isInt({ min: 1, max: 50 }).withMessage('Capacity must be between 1 and 50'),

    body('status')
      .optional()
      .isIn(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING']).withMessage('Invalid table status')
  ]
};

// ==================== ORDER VALIDATION ====================

const orderValidation = {
  create: [
    body('tableId')
      .optional()
      .custom((val) => !val || isValidObjectId(val)).withMessage('Invalid table ID'),

    body('items')
      .isArray({ min: 1 }).withMessage('Order must have at least one item'),

    body('items.*.menuItemId')
      .notEmpty().withMessage('Menu item ID is required')
      .custom(isValidObjectId).withMessage('Invalid menu item ID'),

    body('items.*.quantity')
      .isInt({ min: 1, max: 100 }).withMessage('Quantity must be between 1 and 100'),

    body('items.*.notes')
      .optional()
      .trim()
      .isLength({ max: 200 }).withMessage('Item notes too long'),

    body('items.*.selectedVariant')
      .optional()
      .isObject().withMessage('Selected variant must be an object'),

    body('items.*.selectedModifiers')
      .optional()
      .isArray().withMessage('Selected modifiers must be an array'),

    body('customerName')
      .optional()
      .trim()
      .isLength({ max: 100 }).withMessage('Customer name too long'),

    body('customerPhone')
      .optional()
      .custom((val) => !val || isValidPhone(val)).withMessage('Invalid phone number'),

    body('customerEmail')
      .optional()
      .isEmail().withMessage('Invalid email format')
  ],

  update: [
    param('id')
      .custom(isValidObjectId).withMessage('Invalid order ID'),

    body('items')
      .optional()
      .isArray({ min: 1 }).withMessage('Order must have at least one item'),

    body('discount')
      .optional()
      .isFloat({ min: 0 }).withMessage('Discount must be positive')
  ],

  addItem: [
    param('id')
      .custom(isValidObjectId).withMessage('Invalid order ID'),

    body('menuItemId')
      .notEmpty().withMessage('Menu item ID is required')
      .custom(isValidObjectId).withMessage('Invalid menu item ID'),

    body('quantity')
      .isInt({ min: 1, max: 100 }).withMessage('Quantity must be between 1 and 100')
  ]
};

// ==================== BILL VALIDATION ====================

const billValidation = {
  create: [
    body('orderId')
      .notEmpty().withMessage('Order ID is required')
      .custom(isValidObjectId).withMessage('Invalid order ID'),

    body('paymentMode')
      .notEmpty().withMessage('Payment mode is required')
      .isIn(['CASH', 'CARD', 'UPI', 'WALLET', 'SPLIT', 'PARTIAL', 'OTHER', 'ONLINE'])
      .withMessage('Invalid payment mode'),

    body('customerName')
      .optional()
      .trim()
      .isLength({ max: 100 }).withMessage('Customer name too long'),

    body('customerPhone')
      .optional()
      .custom((val) => !val || isValidPhone(val)).withMessage('Invalid phone number'),

    body('customerEmail')
      .optional()
      .isEmail().withMessage('Invalid email format'),

    body('loyaltyPointsToRedeem')
      .optional()
      .isInt({ min: 0 }).withMessage('Loyalty points must be positive'),

    body('partials')
      .optional()
      .isArray().withMessage('Partials must be an array'),

    body('partials.*.amount')
      .optional()
      .isFloat({ min: 0.01 }).withMessage('Partial amount must be positive'),

    body('partials.*.paymentMode')
      .optional()
      .isIn(['CASH', 'CARD', 'UPI', 'WALLET', 'OTHER']).withMessage('Invalid partial payment mode'),

    body('notes')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Notes too long')
  ]
};

// ==================== CUSTOMER VALIDATION ====================

const customerValidation = {
  create: [
    body('name')
      .trim()
      .notEmpty().withMessage('Customer name is required')
      .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),

    body('phone')
      .optional()
      .custom((val) => !val || isValidPhone(val)).withMessage('Invalid phone number'),

    body('email')
      .optional()
      .isEmail().withMessage('Invalid email format'),

    body('tags')
      .optional()
      .isArray().withMessage('Tags must be an array'),

    body('tags.*')
      .optional()
      .trim()
      .isLength({ max: 30 }).withMessage('Tag too long'),

    body('birthday')
      .optional()
      .isISO8601().withMessage('Invalid birthday format'),

    body('anniversary')
      .optional()
      .isISO8601().withMessage('Invalid anniversary format')
  ],

  update: [
    param('id')
      .custom(isValidObjectId).withMessage('Invalid customer ID'),

    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),

    body('phone')
      .optional()
      .custom((val) => !val || isValidPhone(val)).withMessage('Invalid phone number')
  ],

  adjustLoyalty: [
    param('id')
      .custom(isValidObjectId).withMessage('Invalid customer ID'),

    body('points')
      .notEmpty().withMessage('Points are required')
      .isInt().withMessage('Points must be a number'),

    body('type')
      .notEmpty().withMessage('Type is required')
      .isIn(['EARN', 'REDEEM', 'ADJUST']).withMessage('Type must be EARN, REDEEM, or ADJUST'),

    body('reason')
      .optional()
      .trim()
      .isLength({ max: 200 }).withMessage('Reason too long')
  ]
};

// ==================== RESERVATION VALIDATION ====================

const reservationValidation = {
  create: [
    body('table')
      .notEmpty().withMessage('Table ID is required')
      .custom(isValidObjectId).withMessage('Invalid table ID'),

    body('customerName')
      .trim()
      .notEmpty().withMessage('Customer name is required')
      .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),

    body('customerPhone')
      .trim()
      .notEmpty().withMessage('Phone number is required')
      .custom(isValidPhone).withMessage('Invalid phone number'),

    body('customerEmail')
      .optional()
      .isEmail().withMessage('Invalid email format'),

    body('numberOfGuests')
      .notEmpty().withMessage('Number of guests is required')
      .isInt({ min: 1, max: 50 }).withMessage('Guests must be between 1 and 50'),

    body('reservationDate')
      .notEmpty().withMessage('Reservation date is required')
      .isISO8601().withMessage('Invalid date format')
      .custom((value) => {
        const date = new Date(value);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return date >= today;
      }).withMessage('Reservation date cannot be in the past'),

    body('reservationTime')
      .notEmpty().withMessage('Reservation time is required')
      .matches(/^([01]?\d|2[0-3]):[0-5]\d$/).withMessage('Invalid time format (HH:MM)'),

    body('duration')
      .optional()
      .isInt({ min: 30, max: 480 }).withMessage('Duration must be 30-480 minutes'),

    body('celebrationType')
      .optional()
      .isIn(['BIRTHDAY', 'ANNIVERSARY', 'OTHER']).withMessage('Invalid celebration type'),

    body('specialRequests')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Special requests too long')
  ],

  update: [
    param('id')
      .custom(isValidObjectId).withMessage('Invalid reservation ID'),

    body('status')
      .optional()
      .isIn(['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
      .withMessage('Invalid reservation status')
  ]
};

// ==================== COUPON VALIDATION ====================

const couponValidation = {
  create: [
    body('code')
      .trim()
      .notEmpty().withMessage('Coupon code is required')
      .isLength({ min: 3, max: 20 }).withMessage('Code must be 3-20 characters')
      .matches(/^[A-Z0-9_-]+$/).withMessage('Code must be uppercase alphanumeric')
      .toUpperCase(),

    body('type')
      .notEmpty().withMessage('Discount type is required')
      .isIn(['PERCENTAGE', 'FIXED']).withMessage('Type must be PERCENTAGE or FIXED'),

    body('value')
      .notEmpty().withMessage('Discount value is required')
      .isFloat({ min: 0.01 }).withMessage('Value must be positive')
      .custom((value, { req }) => {
        if (req.body.type === 'PERCENTAGE' && value > 100) {
          throw new Error('Percentage discount cannot exceed 100%');
        }
        return true;
      }),

    body('minOrderAmount')
      .optional()
      .isFloat({ min: 0 }).withMessage('Minimum order must be positive'),

    body('maxDiscount')
      .optional()
      .isFloat({ min: 0 }).withMessage('Maximum discount must be positive'),

    body('validFrom')
      .optional()
      .isISO8601().withMessage('Invalid start date'),

    body('validUntil')
      .notEmpty().withMessage('Expiry date is required')
      .isISO8601().withMessage('Invalid expiry date')
      .custom((value, { req }) => {
        const validFrom = req.body.validFrom ? new Date(req.body.validFrom) : new Date();
        const validUntil = new Date(value);
        if (validUntil <= validFrom) {
          throw new Error('Expiry date must be after start date');
        }
        return true;
      }),

    body('usageLimit')
      .optional()
      .isInt({ min: 1 }).withMessage('Usage limit must be at least 1')
  ]
};

// ==================== INVENTORY VALIDATION ====================

const inventoryValidation = {
  createIngredient: [
    body('name')
      .trim()
      .notEmpty().withMessage('Ingredient name is required')
      .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),

    body('unit')
      .notEmpty().withMessage('Unit is required')
      .isIn(['KG', 'GRAM', 'LITER', 'ML', 'PIECE', 'PACK', 'CUSTOM'])
      .withMessage('Invalid unit'),

    body('currentStock')
      .optional()
      .isFloat({ min: 0 }).withMessage('Current stock must be positive'),

    body('reorderPoint')
      .optional()
      .isFloat({ min: 0 }).withMessage('Reorder point must be positive'),

    body('parLevel')
      .optional()
      .isFloat({ min: 0 }).withMessage('Par level must be positive'),

    body('unitCost')
      .optional()
      .isFloat({ min: 0 }).withMessage('Unit cost must be positive'),

    body('category')
      .optional()
      .trim()
      .isLength({ max: 50 }).withMessage('Category too long')
  ],

  adjustStock: [
    param('id')
      .custom(isValidObjectId).withMessage('Invalid ingredient ID'),

    body('quantity')
      .notEmpty().withMessage('Quantity is required')
      .isFloat().withMessage('Quantity must be a number'),

    body('type')
      .notEmpty().withMessage('Type is required')
      .isIn(['PURCHASE', 'CONSUMPTION', 'WASTAGE', 'ADJUSTMENT', 'TRANSFER'])
      .withMessage('Invalid transaction type'),

    body('notes')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Notes too long')
  ]
};

// ==================== NOTIFICATION VALIDATION ====================

const notificationValidation = {
  create: [
    body('type')
      .notEmpty().withMessage('Notification type is required')
      .isIn(['LOW_STOCK', 'SUBSCRIPTION_EXPIRY', 'NEW_ORDER', 'LARGE_ORDER',
        'FAILED_PAYMENT', 'ORDER_READY', 'RESERVATION_REMINDER', 'SYSTEM'])
      .withMessage('Invalid notification type'),

    body('priority')
      .optional()
      .isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).withMessage('Invalid priority'),

    body('title')
      .trim()
      .notEmpty().withMessage('Title is required')
      .isLength({ max: 200 }).withMessage('Title too long'),

    body('message')
      .trim()
      .notEmpty().withMessage('Message is required')
      .isLength({ max: 1000 }).withMessage('Message too long'),

    body('sentVia')
      .optional()
      .isArray().withMessage('sentVia must be an array'),

    body('sentVia.*')
      .optional()
      .isIn(['IN_APP', 'EMAIL', 'SMS', 'PUSH']).withMessage('Invalid channel')
  ]
};

// ==================== COMMON QUERY VALIDATION ====================

const queryValidation = {
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 }).withMessage('Page must be at least 1'),

    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),

    query('sort')
      .optional()
      .matches(/^-?[a-zA-Z_]+$/).withMessage('Invalid sort field')
  ],

  dateRange: [
    query('startDate')
      .optional()
      .isISO8601().withMessage('Invalid start date'),

    query('endDate')
      .optional()
      .isISO8601().withMessage('Invalid end date')
      .custom((value, { req }) => {
        if (req.query.startDate && new Date(value) < new Date(req.query.startDate)) {
          throw new Error('End date must be after start date');
        }
        return true;
      })
  ]
};

// ==================== RESTAURANT SETTINGS VALIDATION ====================

const restaurantValidation = {
  updateSettings: [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 }).withMessage('Restaurant name must be 2-100 characters'),

    body('gstNumber')
      .optional()
      .custom((val) => !val || isValidGST(val)).withMessage('Invalid GST number format'),

    body('settings.taxPercentage')
      .optional()
      .isFloat({ min: 0, max: 30 }).withMessage('Tax percentage must be 0-30%'),

    body('settings.enableTax')
      .optional()
      .isBoolean().withMessage('enableTax must be true or false'),

    body('settings.enableKOT')
      .optional()
      .isBoolean().withMessage('enableKOT must be true or false'),

    body('settings.tablePrefix')
      .optional()
      .trim()
      .isLength({ max: 5 }).withMessage('Table prefix too long'),

    body('paymentSettings.upiId')
      .optional()
      .trim()
      .matches(/^[\w.-]+@[\w]+$/).withMessage('Invalid UPI ID format')
  ]
};

// ==================== EXPORTS ====================

module.exports = {
  handleValidationErrors,
  authValidation,
  menuValidation,
  tableValidation,
  orderValidation,
  billValidation,
  customerValidation,
  reservationValidation,
  couponValidation,
  inventoryValidation,
  notificationValidation,
  queryValidation,
  restaurantValidation,
  // Helper validators
  isValidObjectId,
  isValidPhone,
  isValidGST,
  isValidPincode
};
