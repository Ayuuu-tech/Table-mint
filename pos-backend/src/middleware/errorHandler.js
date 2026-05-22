/**
 * Global Error Handler Middleware
 * Handles all errors in the application with structured logging and response formatting
 * 
 * Features:
 * - Specific error handling for MongoDB, JWT, validation errors
 * - Different error formats for development vs production
 * - Integration with Winston logger
 * - Error tracking (Sentry-ready)
 */

const { logError } = require('../utils/logger');

// ==================== CUSTOM ERROR CLASSES ====================

/**
 * Base Application Error
 * All custom errors should extend this class
 */
class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      errorCode: this.errorCode,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp
    };
  }
}

/**
 * Validation Error (400)
 * For input validation failures
 */
class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

/**
 * Authentication Error (401)
 * For authentication failures (invalid credentials, expired token)
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

/**
 * Authorization Error (403)
 * For permission/role access denied
 */
class AuthorizationError extends AppError {
  constructor(message = 'Access denied. Insufficient permissions.') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

/**
 * Not Found Error (404)
 * When resource doesn't exist
 */
class NotFoundError extends AppError {
  constructor(resource = 'Resource', id = null) {
    const message = id
      ? `${resource} with ID '${id}' not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
    this.resource = resource;
    this.resourceId = id;
  }
}

/**
 * Conflict Error (409)
 * For duplicate records, conflicting operations
 */
class ConflictError extends AppError {
  constructor(message = 'Resource already exists', field = null) {
    super(message, 409, 'CONFLICT');
    this.field = field;
  }
}

/**
 * Business Logic Error (422)
 * For invalid business operations
 */
class BusinessLogicError extends AppError {
  constructor(message, details = {}) {
    super(message, 422, 'BUSINESS_LOGIC_ERROR');
    this.details = details;
  }
}

/**
 * Rate Limit Error (429)
 * When rate limit exceeded
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please try again later.', retryAfter = 60) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}

/**
 * Database Error (500)
 * For database operation failures
 */
class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR');
  }
}

/**
 * External Service Error (502)
 * For external API/service failures
 */
class ExternalServiceError extends AppError {
  constructor(serviceName, message = 'External service unavailable') {
    super(`${serviceName}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');
    this.serviceName = serviceName;
  }
}

// ==================== ERROR HANDLERS FOR SPECIFIC ERROR TYPES ====================

/**
 * Handle MongoDB Cast Error (invalid ObjectId)
 */
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new ValidationError(message, [{ field: err.path, message, value: err.value }]);
};

/**
 * Handle MongoDB Duplicate Key Error
 */
const handleDuplicateFieldsDB = (err) => {
  const field = Object.keys(err.keyValue || {})[0] || 'field';
  const value = err.keyValue ? err.keyValue[field] : 'unknown';
  const message = `Duplicate value for '${field}': "${value}". Please use a different value.`;
  return new ConflictError(message, field);
};

/**
 * Handle MongoDB Validation Error
 */
const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map(el => ({
    field: el.path,
    message: el.message,
    value: el.value
  }));
  const message = `Invalid input data: ${errors.map(e => e.message).join('. ')}`;
  return new ValidationError(message, errors);
};

/**
 * Handle JWT Error (invalid token)
 */
const handleJWTError = () => {
  return new AuthenticationError('Invalid token. Please log in again.');
};

/**
 * Handle JWT Expired Error
 */
const handleJWTExpiredError = () => {
  return new AuthenticationError('Your session has expired. Please log in again.');
};

/**
 * Handle Multer File Upload Error
 */
const handleMulterError = (err) => {
  let message = 'File upload error';

  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      message = 'File size exceeds the maximum allowed limit';
      break;
    case 'LIMIT_FILE_COUNT':
      message = 'Too many files uploaded';
      break;
    case 'LIMIT_UNEXPECTED_FILE':
      message = 'Unexpected file field';
      break;
    default:
      message = err.message || 'File upload failed';
  }

  return new ValidationError(message);
};

/**
 * Handle Axios/HTTP Request Error (for external API calls)
 */
const handleAxiosError = (err) => {
  const serviceName = err.config?.baseURL || 'External Service';
  const message = err.response?.data?.message || err.message || 'External service request failed';
  return new ExternalServiceError(serviceName, message);
};

// ==================== ERROR RESPONSE FORMATTERS ====================

/**
 * Send detailed error in development mode
 */
const sendErrorDev = (err, req, res) => {
  res.status(err.statusCode).json({
    success: false,
    errorCode: err.errorCode || 'UNKNOWN_ERROR',
    message: err.message,
    errors: err.errors || undefined,
    details: err.details || undefined,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    timestamp: err.timestamp || new Date().toISOString()
  });
};

/**
 * Send minimal error in production mode
 */
const sendErrorProd = (err, req, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    const response = {
      success: false,
      errorCode: err.errorCode,
      message: err.message
    };

    // Include validation errors if present
    if (err.errors && err.errors.length > 0) {
      response.errors = err.errors;
    }

    // Include retry-after for rate limiting
    if (err.retryAfter) {
      res.setHeader('Retry-After', err.retryAfter);
      response.retryAfter = err.retryAfter;
    }

    res.status(err.statusCode).json(response);
  }
  // Programming or unknown error: don't leak error details
  else {
    // Log the error
    logError(err, req);

    res.status(500).json({
      success: false,
      errorCode: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.'
    });
  }
};

// ==================== MAIN ERROR HANDLER MIDDLEWARE ====================

/**
 * Global error handling middleware
 * This should be the last middleware in the Express chain
 */
const errorHandler = (err, req, res, next) => {
  // Set default status code and status
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log all errors
  logError(err, req);

  // Transform known error types
  let error = err;

  // MongoDB errors
  if (err.name === 'CastError') {
    error = handleCastErrorDB(err);
  }
  if (err.code === 11000) {
    error = handleDuplicateFieldsDB(err);
  }
  if (err.name === 'ValidationError' && err.errors) {
    error = handleValidationErrorDB(err);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = handleJWTError();
  }
  if (err.name === 'TokenExpiredError') {
    error = handleJWTExpiredError();
  }

  // Multer errors
  if (err.name === 'MulterError') {
    error = handleMulterError(err);
  }

  // Axios/HTTP errors
  if (err.isAxiosError) {
    error = handleAxiosError(err);
  }

  // Send appropriate response based on environment
  if (process.env.NODE_ENV === 'production') {
    sendErrorProd(error, req, res);
  } else {
    sendErrorDev(error, req, res);
  }
};

// ==================== ASYNC ERROR WRAPPER ====================

/**
 * Wrap async route handlers to catch errors
 * Usage: router.get('/path', catchAsync(async (req, res) => { ... }));
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// ==================== 404 NOT FOUND HANDLER ====================

/**
 * Handle 404 for undefined routes
 * Should be placed after all route definitions
 */
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError('Route', req.originalUrl);
  error.message = `Cannot ${req.method} ${req.originalUrl}`;
  error.errorCode = 'ROUTE_NOT_FOUND';
  next(error);
};

// ==================== EXPORTS ====================

module.exports = {
  // Main middleware
  errorHandler,
  catchAsync,
  notFoundHandler,

  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  BusinessLogicError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError
};
