/**
 * Custom Error Classes for Table Mint
 * Provides specific error types for better error handling and logging
 */

/**
 * Base Application Error
 */
class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.timestamp = new Date();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error (400)
 * Used for input validation failures
 */
class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors; // Array of { field, message } objects
  }
}

/**
 * Authentication Error (401)
 * Used for auth failures, invalid tokens, etc.
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

/**
 * Authorization Error (403)
 * Used for permission/role checks
 */
class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

/**
 * Not Found Error (404)
 * Used when resource doesn't exist
 */
class NotFoundError extends AppError {
  constructor(resource, id) {
    const message = id ? `${resource} with ID ${id} not found` : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
    this.resource = resource;
    this.id = id;
  }
}

/**
 * Conflict Error (409)
 * Used for duplicate records, conflicting operations
 */
class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Business Logic Error (422)
 * Used for invalid business operations
 */
class BusinessLogicError extends AppError {
  constructor(message) {
    super(message, 422, 'BUSINESS_LOGIC_ERROR');
  }
}

/**
 * Database Error (500)
 * Wraps database-specific errors
 */
class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR');
  }
}

/**
 * Rate Limit Error (429)
 * Used by rate limiter (custom message)
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * Convert validation errors array to detailed format
 */
const formatValidationErrors = (errors) => {
  return errors.map(err => ({
    field: err.param || err.field,
    message: err.msg,
    value: err.value
  }));
};

/**
 * Wrap async route handlers to catch errors
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  BusinessLogicError,
  DatabaseError,
  RateLimitError,
  formatValidationErrors,
  asyncHandler
};
