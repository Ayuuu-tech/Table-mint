/**
 * Logger Configuration for Table Mint
 * Provides comprehensive logging for debugging, monitoring, and auditing
 * 
 * Usage:
 * const { logger, logError, logAuthEvent, logOperation, logDatabaseOperation } = require('./utils/logger');
 * logger.info('Message here', { metadata });
 * logError(error, req);
 * logAuthEvent('LOGIN', userId, restaurantId, true);
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log levels with custom colors
const customLevels = {
  levels: {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    http: 4,
    debug: 5,
    trace: 6
  },
  colors: {
    fatal: 'red bold',
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue',
    trace: 'gray'
  }
};

// Add colors to Winston
winston.addColors(customLevels.colors);

// Custom format for structured logging
const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Custom format for console (development)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    let output = `${timestamp} ${level}: ${message}`;

    // Add relevant metadata
    const { service, ...customMeta } = meta;
    if (Object.keys(customMeta).length > 0) {
      // Truncate long objects
      const metaStr = JSON.stringify(customMeta);
      output += metaStr.length > 200 ? ` ${metaStr.substring(0, 200)}...` : ` ${metaStr}`;
    }

    return output;
  })
);

// Create Winston logger instance
const logger = winston.createLogger({
  levels: customLevels.levels,
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: {
    service: 'table-mint-api',
    environment: process.env.NODE_ENV || 'development'
  },
  format: structuredFormat,
  transports: [
    // Error logs file (errors only)
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true
    }),

    // Combined logs file (all levels)
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 15,
      tailable: true
    }),

    // HTTP request logs (http level only)
    new winston.transports.File({
      filename: path.join(logsDir, 'http.log'),
      level: 'http',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    })
  ],
  exitOnError: false
});

// Console transport for non-production environments
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

/**
 * Middleware for logging HTTP requests
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {Function} next - Express next function
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Attach request ID for tracing
  req.requestId = requestId;

  // Log incoming request
  logger.http('Incoming request', {
    requestId,
    method: req.method,
    path: req.originalUrl || req.path,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || 'anonymous',
    restaurantId: req.user?.restaurantId || null
  });

  // Capture response
  const originalEnd = res.end;
  res.end = function (chunk, encoding) {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 400 ? 'warn' : 'http';

    logger.log(level, 'Request completed', {
      requestId,
      method: req.method,
      path: req.originalUrl || req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length') || 0,
      userId: req.user?.id || 'anonymous',
      restaurantId: req.user?.restaurantId || null
    });

    originalEnd.call(this, chunk, encoding);
  };

  next();
};

/**
 * Log errors with full context
 * @param {Error} err - Error object
 * @param {Request} req - Express request (optional)
 */
const logError = (err, req = null) => {
  const errorLog = {
    errorCode: err.errorCode || err.code || 'UNKNOWN_ERROR',
    errorName: err.name || 'Error',
    statusCode: err.statusCode || 500,
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString()
  };

  // Add request context if available
  if (req) {
    errorLog.request = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl || req.path,
      ip: req.ip || req.connection?.remoteAddress,
      userId: req.user?.id || 'anonymous',
      restaurantId: req.user?.restaurantId || null,
      body: sanitizeRequestBody(req.body)
    };
  }

  // Add validation errors if present
  if (err.errors && Array.isArray(err.errors)) {
    errorLog.validationErrors = err.errors;
  }

  logger.error(err.message, errorLog);
};

/**
 * Log authentication events
 * @param {string} action - Action type (LOGIN, LOGOUT, SIGNUP, TOKEN_REFRESH, etc.)
 * @param {string} userId - User ID
 * @param {string} restaurantId - Restaurant ID
 * @param {boolean} success - Whether action succeeded
 * @param {string} reason - Failure reason (optional)
 */
const logAuthEvent = (action, userId, restaurantId, success = true, reason = null) => {
  const level = success ? 'info' : 'warn';
  logger.log(level, `Auth: ${action}`, {
    category: 'auth',
    action,
    userId: userId || 'unknown',
    restaurantId: restaurantId || 'unknown',
    success,
    reason,
    timestamp: new Date().toISOString()
  });
};

/**
 * Log sensitive/important operations
 * @param {string} operation - Operation type
 * @param {string} userId - User ID
 * @param {string} restaurantId - Restaurant ID
 * @param {Object} details - Additional details
 */
const logOperation = (operation, userId, restaurantId, details = {}) => {
  logger.info(`Operation: ${operation}`, {
    category: 'operation',
    operation,
    userId,
    restaurantId,
    ...details,
    timestamp: new Date().toISOString()
  });
};

/**
 * Log database operations
 * @param {string} operation - Operation type (CREATE, READ, UPDATE, DELETE)
 * @param {string} collection - Collection/model name
 * @param {number} count - Affected records count
 * @param {number} duration - Operation duration in ms
 */
const logDatabaseOperation = (operation, collection, count = 0, duration = 0) => {
  logger.debug(`DB: ${operation} on ${collection}`, {
    category: 'database',
    operation,
    collection,
    affectedRecords: count,
    duration: `${duration}ms`
  });
};

/**
 * Log payment/billing events
 * @param {string} action - Action type (PAYMENT_INITIATED, PAYMENT_SUCCESS, etc.)
 * @param {string} billId - Bill ID
 * @param {number} amount - Amount
 * @param {string} paymentMode - Payment mode
 * @param {Object} details - Additional details
 */
const logPaymentEvent = (action, billId, amount, paymentMode, details = {}) => {
  logger.info(`Payment: ${action}`, {
    category: 'payment',
    action,
    billId,
    amount,
    paymentMode,
    ...details,
    timestamp: new Date().toISOString()
  });
};

/**
 * Log inventory events
 * @param {string} action - Action type (STOCK_UPDATE, LOW_STOCK_ALERT, etc.)
 * @param {string} ingredientId - Ingredient ID
 * @param {Object} details - Additional details
 */
const logInventoryEvent = (action, ingredientId, details = {}) => {
  const level = action.includes('ALERT') ? 'warn' : 'info';
  logger.log(level, `Inventory: ${action}`, {
    category: 'inventory',
    action,
    ingredientId,
    ...details,
    timestamp: new Date().toISOString()
  });
};

/**
 * Log notification events
 * @param {string} action - Action type (SENT, FAILED, SCHEDULED)
 * @param {string} type - Notification type
 * @param {string} channel - Channel (EMAIL, SMS, IN_APP)
 * @param {Object} details - Additional details
 */
const logNotificationEvent = (action, type, channel, details = {}) => {
  const level = action === 'FAILED' ? 'error' : 'info';
  logger.log(level, `Notification: ${action}`, {
    category: 'notification',
    action,
    type,
    channel,
    ...details,
    timestamp: new Date().toISOString()
  });
};

/**
 * Log Socket.IO events
 * @param {string} event - Event name
 * @param {string} userId - User ID
 * @param {string} socketId - Socket ID
 * @param {Object} details - Additional details
 */
const logSocketEvent = (event, userId, socketId, details = {}) => {
  logger.debug(`Socket: ${event}`, {
    category: 'socket',
    event,
    userId,
    socketId,
    ...details
  });
};

/**
 * Sanitize request body for logging (remove sensitive data)
 * @param {Object} body - Request body
 * @returns {Object} - Sanitized body
 */
const sanitizeRequestBody = (body) => {
  if (!body || typeof body !== 'object') return body;

  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'cardNumber', 'cvv', 'pin'];
  const sanitized = { ...body };

  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
};

/**
 * Create child logger with additional context
 * @param {Object} context - Additional context to add to all logs
 * @returns {Object} - Child logger
 */
const createChildLogger = (context) => {
  return logger.child(context);
};

module.exports = {
  logger,
  requestLogger,
  logError,
  logAuthEvent,
  logOperation,
  logDatabaseOperation,
  logPaymentEvent,
  logInventoryEvent,
  logNotificationEvent,
  logSocketEvent,
  createChildLogger
};
