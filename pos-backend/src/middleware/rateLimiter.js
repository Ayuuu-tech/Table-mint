const rateLimit = require('express-rate-limit');

/**
 * Global Rate Limiter
 * Apply to all requests to prevent abuse
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // Increased to 5000 to prevent blocking normal usage
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip static files and OPTIONS requests
    return req.path.startsWith('/uploads') || req.method === 'OPTIONS';
  }
});

/**
 * Authentication Rate Limiter
 * Strict limits for login/signup to prevent brute force
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Increased to 100 for dev/testing
  message: {
    success: false,
    message: 'Too many login attempts, please try again after 15 minutes.'
  },
  skipSuccessfulRequests: true, // Don't count successful requests
  skipFailedRequests: false // Count failed requests
});

/**
 * API Rate Limiter
 * Standard limits for API endpoints
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 2000, // Increased to 2000 requests per minute
  message: {
    success: false,
    message: 'API rate limit exceeded, please try again later.'
  },
  skip: (req) => req.method === 'OPTIONS' // Skip OPTIONS requests
});

/**
 * Payment Rate Limiter
 * Strict limits for payment operations
 */
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 payment attempts per hour
  message: {
    success: false,
    message: 'Too many payment attempts, please try again later.'
  },
  skipSuccessfulRequests: true
});

/**
 * File Upload Rate Limiter
 * Limit file uploads to prevent storage abuse
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 uploads per hour
  message: {
    success: false,
    message: 'File upload limit exceeded, please try again later.'
  }
});

module.exports = {
  globalLimiter,
  authLimiter,
  apiLimiter,
  paymentLimiter,
  uploadLimiter
};
