/**
 * List Endpoint Pagination
 * Adds pagination support to all list endpoints (orders, bills, reservations, etc.)
 */

const { cacheService, cacheMiddleware } = require('./cacheService');
const { createError } = require('./errors');

/**
 * Pagination helper
 * Extracts and validates pagination params
 */
const getPaginationParams = (req, defaults = {}) => {
  let {
    page = defaults.page || 1,
    limit = defaults.limit || 20,
    sort = defaults.sort || '-createdAt'
  } = req.query;

  page = Math.max(1, parseInt(page) || 1);
  limit = Math.min(Math.max(1, parseInt(limit) || 20), 100); // Cap at 100

  return { page, limit, sort };
};

/**
 * Build pagination response
 */
const buildPaginationResponse = (data, page, limit, total) => {
  const pages = Math.ceil(total / limit);

  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      pages,
      hasNextPage: page < pages,
      hasPrevPage: page > 1
    }
  };
};

/**
 * Orders list with pagination
 */
exports.listOrders = [
  cacheMiddleware(300), // Cache for 5 minutes
  async (req, res, next) => {
    try {
      const { page, limit, sort } = getPaginationParams(req, { limit: 20 });
      const { restaurantId, status, customerId } = req.query;

      const Order = require('../models/Order');

      // Build filter
      const filter = {};
      if (restaurantId) filter.restaurantId = restaurantId;
      if (status) filter.status = status;
      if (customerId) filter.customerId = customerId;

      // Count total
      const total = await Order.countDocuments(filter);

      // Fetch paginated data
      const data = await Order.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-__v')
        .lean();

      res.json(buildPaginationResponse(data, page, limit, total));
    } catch (error) {
      next(error);
    }
  }
];

/**
 * Bills list with pagination
 */
exports.listBills = [
  cacheMiddleware(300),
  async (req, res, next) => {
    try {
      const { page, limit, sort } = getPaginationParams(req, { limit: 20 });
      const { restaurantId, status, orderId } = req.query;

      const Bill = require('../models/Bill');

      const filter = {};
      if (restaurantId) filter.restaurantId = restaurantId;
      if (status) filter.status = status;
      if (orderId) filter.orderId = orderId;

      const total = await Bill.countDocuments(filter);

      const data = await Bill.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-__v')
        .lean();

      res.json(buildPaginationResponse(data, page, limit, total));
    } catch (error) {
      next(error);
    }
  }
];

/**
 * Reservations list with pagination
 */
exports.listReservations = [
  cacheMiddleware(300),
  async (req, res, next) => {
    try {
      const { page, limit, sort } = getPaginationParams(req, { limit: 20, sort: '-reservationDate' });
      const { restaurantId, status, date } = req.query;

      const Reservation = require('../models/Reservation');

      const filter = {};
      if (restaurantId) filter.restaurantId = restaurantId;
      if (status) filter.status = status;
      if (date) {
        const startDate = new Date(date);
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() + 1);
        filter.reservationDate = { $gte: startDate, $lt: endDate };
      }

      const total = await Reservation.countDocuments(filter);

      const data = await Reservation.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('customerId', 'name email phone')
        .populate('tableId', 'number capacity')
        .select('-__v')
        .lean();

      res.json(buildPaginationResponse(data, page, limit, total));
    } catch (error) {
      next(error);
    }
  }
];

/**
 * Menu items list with pagination
 */
exports.listMenuItems = [
  cacheMiddleware(600), // Cache for 10 minutes
  async (req, res, next) => {
    try {
      const { page, limit, sort } = getPaginationParams(req, { limit: 20 });
      const { restaurantId, category, available } = req.query;

      const MenuItem = require('../models/MenuItem');

      const filter = {};
      if (restaurantId) filter.restaurantId = restaurantId;
      if (category) filter.category = category;
      if (available !== undefined) filter.available = available === 'true';

      const total = await MenuItem.countDocuments(filter);

      const data = await MenuItem.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-__v')
        .lean();

      res.json(buildPaginationResponse(data, page, limit, total));
    } catch (error) {
      next(error);
    }
  }
];

/**
 * Customers list with pagination
 */
exports.listCustomers = [
  cacheMiddleware(600),
  async (req, res, next) => {
    try {
      const { page, limit, sort } = getPaginationParams(req, { limit: 20, sort: '-createdAt' });
      const { restaurantId, search } = req.query;

      const User = require('../models/User');

      const filter = {
        restaurantId,
        role: 'customer'
      };

      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ];
      }

      const total = await User.countDocuments(filter);

      const data = await User.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-password -__v')
        .lean();

      res.json(buildPaginationResponse(data, page, limit, total));
    } catch (error) {
      next(error);
    }
  }
];

/**
 * Tables list (non-paginated, usually small dataset)
 */
exports.listTables = [
  cacheMiddleware(1800), // Cache for 30 minutes
  async (req, res, next) => {
    try {
      const { restaurantId, available } = req.query;
      const Table = require('../models/Table');

      const filter = {};
      if (restaurantId) filter.restaurantId = restaurantId;
      if (available !== undefined) filter.available = available === 'true';

      const data = await Table.find(filter)
        .sort('number')
        .select('-__v')
        .lean();

      res.json({
        success: true,
        data,
        pagination: {
          page: 1,
          limit: data.length,
          total: data.length,
          pages: 1,
          hasNextPage: false,
          hasPrevPage: false
        }
      });
    } catch (error) {
      next(error);
    }
  }
];

/**
 * Coupons list with pagination
 */
exports.listCoupons = [
  cacheMiddleware(600),
  async (req, res, next) => {
    try {
      const { page, limit, sort } = getPaginationParams(req, { limit: 20 });
      const { restaurantId, active } = req.query;

      const Coupon = require('../models/Coupon');

      const filter = {};
      if (restaurantId) filter.restaurantId = restaurantId;
      if (active !== undefined) {
        const now = new Date();
        if (active === 'true') {
          filter.validFrom = { $lte: now };
          filter.validUntil = { $gte: now };
        } else {
          filter.$or = [
            { validFrom: { $gt: now } },
            { validUntil: { $lt: now } }
          ];
        }
      }

      const total = await Coupon.countDocuments(filter);

      const data = await Coupon.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-__v')
        .lean();

      res.json(buildPaginationResponse(data, page, limit, total));
    } catch (error) {
      next(error);
    }
  }
];

/**
 * Activity/Transaction list with pagination
 */
exports.listTransactions = [
  cacheMiddleware(300),
  async (req, res, next) => {
    try {
      const { page, limit, sort } = getPaginationParams(req, { limit: 20, sort: '-createdAt' });
      const { restaurantId, type, orderId } = req.query;

      // This assumes you have a transaction/activity model
      // Adjust based on your actual schema
      const query = {};
      if (restaurantId) query.restaurantId = restaurantId;
      if (type) query.type = type;
      if (orderId) query.orderId = orderId;

      // Using Order model as transaction source for now
      const Order = require('../models/Order');

      const total = await Order.countDocuments(query);

      const data = await Order.find(query)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .select('_id status totalAmount createdAt')
        .lean();

      res.json(buildPaginationResponse(data, page, limit, total));
    } catch (error) {
      next(error);
    }
  }
];

/**
 * Search with pagination
 */
exports.searchItems = [
  async (req, res, next) => {
    try {
      const { q, type = 'menu', page = 1, limit = 20, restaurantId } = req.query;

      if (!q || q.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Search query must be at least 2 characters'
        });
      }

      const pageNum = Math.max(1, parseInt(page));
      const pageLimit = Math.min(Math.max(1, parseInt(limit)), 100);

      const regex = { $regex: q, $options: 'i' };
      let Model;
      let searchFields = [];

      switch (type) {
        case 'menu':
          Model = require('../models/MenuItem');
          searchFields = ['name', 'description'];
          break;
        case 'orders':
          Model = require('../models/Order');
          searchFields = ['_id', 'status'];
          break;
        case 'customers':
          Model = require('../models/User');
          searchFields = ['name', 'email', 'phone'];
          break;
        default:
          return res.status(400).json({ success: false, message: 'Invalid search type' });
      }

      const filter = {
        $or: searchFields.map((field) => ({ [field]: regex }))
      };

      if (restaurantId) {
        filter.restaurantId = restaurantId;
      }

      const total = await Model.countDocuments(filter);

      const data = await Model.find(filter)
        .skip((pageNum - 1) * pageLimit)
        .limit(pageLimit)
        .select('-__v')
        .lean();

      res.json(buildPaginationResponse(data, pageNum, pageLimit, total));
    } catch (error) {
      next(error);
    }
  }
];

/**
 * Export helpers
 */
exports.getPaginationParams = getPaginationParams;
exports.buildPaginationResponse = buildPaginationResponse;
