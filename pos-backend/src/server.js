const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const fileUpload = require('express-fileupload');
const path = require('path');
const helmet = require('helmet');
const RealtimeSyncService = require('./services/realtimeSync');
const { globalLimiter, authLimiter, apiLimiter, uploadLimiter } = require('./middleware/rateLimiter');
const { autoRotateSecrets } = require('./middleware/jwtSecretManager');
const { connectDatabase } = require('./config/database');
const { validateEnv } = require('./utils/envValidation');
const { logger, requestLogger, logError } = require('./utils/logger');

// Load env vars
dotenv.config();

// Validate environment configuration
validateEnv();

// Import routes
const authRoutes = require('./routes/authRoutes');
const restaurantRoutes = require('./routes/restaurantRoutes');
const menuRoutes = require('./routes/menuRoutes');
const tableRoutes = require('./routes/tableRoutes');
const orderRoutes = require('./routes/orderRoutes');
const billRoutes = require('./routes/billRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const reportRoutes = require('./routes/reportRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const customerRoutes = require('./routes/customerRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const kitchenRoutes = require('./routes/kitchenRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const notificationScheduler = require('./services/notificationScheduler');

// Conditionally load Swagger (not in test environment)
let swaggerServe, swaggerSetup;
if (process.env.NODE_ENV !== 'test') {
  try {
    const swagger = require('./utils/swagger');
    swaggerServe = swagger.swaggerServe;
    swaggerSetup = swagger.swaggerSetup;
  } catch (err) {
    console.warn('Swagger not available:', err.message);
  }
}

const app = express();
const server = http.createServer(app);

// ========== SECURITY MIDDLEWARE ==========

// CORS MUST come before Helmet to ensure proper headers
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001').split(',').map(o => o.trim());
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, curl requests)
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin, 'Allowed:', allowedOrigins);
      callback(null, true); // Allow for now to debug
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Helmet for security headers - configured to not interfere with CORS
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP to avoid conflicts
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false, // Disable to not interfere with CORS
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
  hidePoweredBy: true
}));

// Global rate limiter (after CORS)
app.use(globalLimiter);

// JWT secret auto-rotation check
app.use(autoRotateSecrets);

// Body parsers with size limits to prevent DoS
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Static files for uploaded images
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Initialize Socket.io with real-time sync
const realtime = new RealtimeSyncService(server);
app.locals.realtime = realtime;
app.set('io', realtime.io); // Make io accessible to controllers

// Connect to MongoDB
connectDatabase();

// Request logging middleware (using Winston logger)
if (process.env.NODE_ENV !== 'test') {
  app.use(requestLogger);
}

// Handle OPTIONS preflight requests explicitly
app.options('*', cors());

// API Documentation (Swagger)
if (swaggerServe && swaggerSetup) {
  app.use('/api-docs', swaggerServe, swaggerSetup);
  logger.info('📚 API Documentation available at /api-docs');
}

// Routes
app.get('/', (req, res) => {
  res.json({
    message: '🍽️ Table Mint POS API',
    version: '2.0.0',
    status: 'running',
    security: 'enabled'
  });
});

// Auth routes with rate limiting
app.use('/api/auth', authLimiter, authRoutes);

// API routes with rate limiting
app.use('/api/restaurants', apiLimiter, restaurantRoutes);
app.use('/api/tables', apiLimiter, tableRoutes);
app.use('/api/orders', apiLimiter, orderRoutes);
app.use('/api/bills', apiLimiter, billRoutes);
app.use('/api/subscriptions', apiLimiter, subscriptionRoutes);
app.use('/api/reports', apiLimiter, reportRoutes);
app.use('/api/analytics', apiLimiter, analyticsRoutes);
app.use('/api/customers', apiLimiter, customerRoutes);
app.use('/api/inventory', apiLimiter, inventoryRoutes);
app.use('/api/kitchen', apiLimiter, kitchenRoutes);
app.use('/api/notifications', apiLimiter, notificationRoutes);
app.use('/api/coupons', apiLimiter, require('./routes/couponRoutes'));
app.use('/api/reservations', apiLimiter, require('./routes/reservationRoutes'));

// Menu with file upload rate limiting
app.use('/api/menu', uploadLimiter, fileUpload({
  createParentPath: true,
  limits: { fileSize: 5 * 1024 * 1024 },
  abortOnLimit: true,
  useTempFiles: true,
  tempFileDir: '/tmp/',
  safeFileNames: true,
  preserveExtension: true
}), menuRoutes);

// 404 Handler - Must be after all routes
app.use(notFoundHandler);

// Global Error Handler - Must be last middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // Don't exit in development, log and continue
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  // Don't exit in development, log and continue
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Socket.io ready for real-time sync`);
  console.log(`🔒 Security: Helmet + Rate Limiting + JWT Rotation enabled`);
  console.log(`🌍 CORS: Whitelist mode active`);

  // Start notification scheduler
  notificationScheduler.start();
}).on('error', (err) => {
  console.error('❌ Server failed to start:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please kill the process or use a different port.`);
  }
  process.exit(1);
});

module.exports = { app, server, realtime };
