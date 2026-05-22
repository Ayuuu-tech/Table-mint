/**
 * API Versioning Configuration
 * Supports multiple API versions for backward compatibility
 */

const express = require('express');

/**
 * Mount versioned API routes
 * Supports /api/v1/, /api/v2/, etc.
 */
const mountVersionedRoutes = (app) => {
  // Create v1 router
  const v1Router = express.Router();

  // Import route files
  const authRoutes = require('../routes/authRoutes');
  const restaurantRoutes = require('../routes/restaurantRoutes');
  const menuRoutes = require('../routes/menuRoutes');
  const tableRoutes = require('../routes/tableRoutes');
  const orderRoutes = require('../routes/orderRoutes');
  const billRoutes = require('../routes/billRoutes');
  const subscriptionRoutes = require('../routes/subscriptionRoutes');
  const reportRoutes = require('../routes/reportRoutes');
  const analyticsRoutes = require('../routes/analyticsRoutes');
  const customerRoutes = require('../routes/customerRoutes');
  const couponRoutes = require('../routes/couponRoutes');
  const reservationRoutes = require('../routes/reservationRoutes');
  const inventoryRoutes = require('../routes/inventoryRoutes');

  const { authLimiter, apiLimiter, uploadLimiter } = require('../middleware/rateLimiter');
  const fileUpload = require('express-fileupload');

  // Mount v1 routes
  v1Router.use('/auth', authLimiter, authRoutes);
  v1Router.use('/restaurants', apiLimiter, restaurantRoutes);
  v1Router.use('/tables', apiLimiter, tableRoutes);
  v1Router.use('/orders', apiLimiter, orderRoutes);
  v1Router.use('/bills', apiLimiter, billRoutes);
  v1Router.use('/subscriptions', apiLimiter, subscriptionRoutes);
  v1Router.use('/reports', apiLimiter, reportRoutes);
  v1Router.use('/analytics', apiLimiter, analyticsRoutes);
  v1Router.use('/customers', apiLimiter, customerRoutes);
  v1Router.use('/inventory', apiLimiter, inventoryRoutes);
  v1Router.use('/coupons', apiLimiter, couponRoutes);
  v1Router.use('/reservations', apiLimiter, reservationRoutes);
  v1Router.use('/menu', uploadLimiter, fileUpload({
    createParentPath: true,
    limits: { fileSize: 5 * 1024 * 1024 },
    abortOnLimit: true,
    useTempFiles: true,
    tempFileDir: '/tmp/',
    safeFileNames: true,
    preserveExtension: true
  }), menuRoutes);

  // Mount v1 API
  app.use('/api/v1', v1Router);

  // Add deprecated endpoint warning for old /api routes
  app.use('/api', (req, res, next) => {
    res.status(301).json({
      success: false,
      message: 'API v0 is deprecated. Please use /api/v1 instead.',
      newUrl: `${req.protocol}://${req.get('host')}/api/v1${req.path}`
    });
  });

  return v1Router;
};

/**
 * Version comparison utility
 * Useful for handling breaking changes
 */
const isVersionGreaterOrEqual = (clientVersion, minRequiredVersion) => {
  const parse = (v) => v.split('.').map(Number);
  const client = parse(clientVersion);
  const minRequired = parse(minRequiredVersion);

  for (let i = 0; i < minRequired.length; i++) {
    if ((client[i] || 0) > (minRequired[i] || 0)) return true;
    if ((client[i] || 0) < (minRequired[i] || 0)) return false;
  }

  return true;
};

/**
 * API version middleware
 * Extracts and validates API version from request
 */
const versionMiddleware = (req, res, next) => {
  // Extract version from URL path
  const match = req.path.match(/^\/api\/v(\d+)/);
  const version = match ? match[1] : '1';

  req.apiVersion = parseInt(version);
  req.apiVersionString = `v${version}`;

  next();
};

/**
 * Example usage in a controller to handle multiple versions:
 * 
 * if (req.apiVersion === 1) {
 *   // V1 logic
 * } else if (req.apiVersion === 2) {
 *   // V2 logic
 * }
 */

module.exports = {
  mountVersionedRoutes,
  isVersionGreaterOrEqual,
  versionMiddleware
};
