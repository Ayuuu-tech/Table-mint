/**
 * Environment Validation
 * Comprehensive validation of all environment variables on startup
 * 
 * Usage: Call validateEnv() at the start of server.js
 */

const fs = require('fs');
const path = require('path');

// Environment variable definitions with validation rules
const ENV_DEFINITIONS = {
  // ==================== SERVER CONFIGURATION ====================
  NODE_ENV: {
    required: false,
    default: 'development',
    validate: (val) => ['development', 'production', 'test'].includes(val),
    message: 'NODE_ENV must be development, production, or test'
  },
  PORT: {
    required: false,
    default: '5000',
    validate: (val) => {
      const port = parseInt(val);
      return !isNaN(port) && port > 0 && port < 65536;
    },
    message: 'PORT must be a valid port number (1-65535)'
  },

  // ==================== DATABASE ====================
  MONGODB_URI: {
    required: false,  // Not required if using memory DB
    validate: (val) => {
      if (!val) return true; // Allow empty for memory DB
      return val.startsWith('mongodb://') || val.startsWith('mongodb+srv://');
    },
    message: 'MONGODB_URI must be a valid MongoDB connection string'
  },
  USE_MEMORY_DB: {
    required: false,
    default: 'false',
    validate: (val) => ['true', 'false'].includes(val.toLowerCase()),
    message: 'USE_MEMORY_DB must be true or false'
  },

  // ==================== JWT AUTHENTICATION ====================
  JWT_SECRET: {
    required: true,
    sensitive: true,
    validate: (val) => val && val.length >= 32,
    message: 'JWT_SECRET is required and must be at least 32 characters for security'
  },
  JWT_EXPIRE: {
    required: false,
    default: '7d',
    validate: (val) => /^\d+[smhdw]$/.test(val),
    message: 'JWT_EXPIRE must be a valid duration (e.g., 7d, 24h, 30m)'
  },
  JWT_REFRESH_SECRET: {
    required: false,
    sensitive: true,
    validate: (val) => !val || val.length >= 32,
    message: 'JWT_REFRESH_SECRET must be at least 32 characters if provided'
  },
  SECRET_ROTATION_INTERVAL_DAYS: {
    required: false,
    default: '30',
    validate: (val) => {
      const days = parseInt(val);
      return !isNaN(days) && days >= 1 && days <= 365;
    },
    message: 'SECRET_ROTATION_INTERVAL_DAYS must be between 1 and 365'
  },

  // ==================== CORS ====================
  ALLOWED_ORIGINS: {
    required: false,
    default: 'http://localhost:3000',
    validate: () => true, // Comma-separated list
    message: 'ALLOWED_ORIGINS should be comma-separated URLs'
  },
  FRONTEND_URL: {
    required: false,
    default: 'http://localhost:3000',
    validate: (val) => {
      try {
        new URL(val);
        return true;
      } catch {
        return false;
      }
    },
    message: 'FRONTEND_URL must be a valid URL'
  },

  // ==================== RATE LIMITING ====================
  RATE_LIMIT_WINDOW_MS: {
    required: false,
    default: '900000', // 15 minutes
    validate: (val) => {
      const ms = parseInt(val);
      return !isNaN(ms) && ms >= 1000;
    },
    message: 'RATE_LIMIT_WINDOW_MS must be at least 1000ms'
  },
  RATE_LIMIT_MAX_REQUESTS: {
    required: false,
    default: '100',
    validate: (val) => {
      const max = parseInt(val);
      return !isNaN(max) && max >= 1;
    },
    message: 'RATE_LIMIT_MAX_REQUESTS must be at least 1'
  },
  AUTH_RATE_LIMIT_MAX: {
    required: false,
    default: '5',
    validate: (val) => {
      const max = parseInt(val);
      return !isNaN(max) && max >= 1;
    },
    message: 'AUTH_RATE_LIMIT_MAX must be at least 1'
  },
  API_RATE_LIMIT_MAX: {
    required: false,
    default: '30',
    validate: (val) => {
      const max = parseInt(val);
      return !isNaN(max) && max >= 1;
    },
    message: 'API_RATE_LIMIT_MAX must be at least 1'
  },
  UPLOAD_RATE_LIMIT_MAX: {
    required: false,
    default: '50',
    validate: (val) => {
      const max = parseInt(val);
      return !isNaN(max) && max >= 1;
    },
    message: 'UPLOAD_RATE_LIMIT_MAX must be at least 1'
  },

  // ==================== FILE UPLOADS ====================
  MAX_FILE_SIZE: {
    required: false,
    default: '5242880', // 5MB
    validate: (val) => {
      const size = parseInt(val);
      return !isNaN(size) && size >= 1024;
    },
    message: 'MAX_FILE_SIZE must be at least 1024 bytes'
  },
  ALLOWED_IMAGE_TYPES: {
    required: false,
    default: 'image/jpeg,image/png,image/webp,image/gif',
    validate: () => true,
    message: 'ALLOWED_IMAGE_TYPES should be comma-separated MIME types'
  },
  UPLOAD_DIR: {
    required: false,
    default: './uploads',
    validate: () => true,
    message: 'UPLOAD_DIR should be a valid path'
  },

  // ==================== BUSINESS LOGIC ====================
  TRIAL_PERIOD_DAYS: {
    required: false,
    default: '7',
    validate: (val) => {
      const days = parseInt(val);
      return !isNaN(days) && days >= 0 && days <= 90;
    },
    message: 'TRIAL_PERIOD_DAYS must be between 0 and 90'
  },
  DEFAULT_TAX_PERCENTAGE: {
    required: false,
    default: '5',
    validate: (val) => {
      const tax = parseFloat(val);
      return !isNaN(tax) && tax >= 0 && tax <= 100;
    },
    message: 'DEFAULT_TAX_PERCENTAGE must be between 0 and 100'
  },
  LARGE_ORDER_THRESHOLD: {
    required: false,
    default: '5000',
    validate: (val) => {
      const threshold = parseFloat(val);
      return !isNaN(threshold) && threshold >= 0;
    },
    message: 'LARGE_ORDER_THRESHOLD must be a positive number'
  },

  // ==================== PAYMENT GATEWAY (RAZORPAY) ====================
  RAZORPAY_KEY_ID: {
    required: false,
    sensitive: true,
    validate: (val) => !val || val.startsWith('rzp_'),
    message: 'RAZORPAY_KEY_ID should start with rzp_'
  },
  RAZORPAY_KEY_SECRET: {
    required: false,
    sensitive: true,
    validate: () => true,
    message: 'RAZORPAY_KEY_SECRET should be provided if using Razorpay'
  },

  // ==================== EMAIL (SMTP) ====================
  SMTP_HOST: {
    required: false,
    validate: () => true,
    message: 'SMTP_HOST should be a valid hostname'
  },
  SMTP_PORT: {
    required: false,
    default: '587',
    validate: (val) => {
      const port = parseInt(val);
      return !isNaN(port) && port > 0 && port < 65536;
    },
    message: 'SMTP_PORT must be a valid port number'
  },
  SMTP_SECURE: {
    required: false,
    default: 'false',
    validate: (val) => ['true', 'false'].includes(val.toLowerCase()),
    message: 'SMTP_SECURE must be true or false'
  },
  SMTP_USER: {
    required: false,
    sensitive: true,
    validate: () => true,
    message: 'SMTP_USER should be a valid email address'
  },
  SMTP_PASS: {
    required: false,
    sensitive: true,
    validate: () => true,
    message: 'SMTP_PASS is the email password or app password'
  },
  EMAIL_FROM_NAME: {
    required: false,
    default: 'Table Mint POS',
    validate: () => true,
    message: 'EMAIL_FROM_NAME is the sender name for emails'
  },

  // ==================== SMS (TWILIO) ====================
  TWILIO_ACCOUNT_SID: {
    required: false,
    sensitive: true,
    validate: (val) => !val || val.startsWith('AC'),
    message: 'TWILIO_ACCOUNT_SID should start with AC'
  },
  TWILIO_AUTH_TOKEN: {
    required: false,
    sensitive: true,
    validate: () => true,
    message: 'TWILIO_AUTH_TOKEN is required for SMS functionality'
  },
  TWILIO_PHONE_NUMBER: {
    required: false,
    validate: (val) => !val || /^\+\d{10,15}$/.test(val),
    message: 'TWILIO_PHONE_NUMBER should be in international format (+1234567890)'
  },

  // ==================== LOGGING ====================
  LOG_LEVEL: {
    required: false,
    default: 'info',
    validate: (val) => ['fatal', 'error', 'warn', 'info', 'http', 'debug', 'trace'].includes(val),
    message: 'LOG_LEVEL must be one of: fatal, error, warn, info, http, debug, trace'
  },
  LOG_FILE: {
    required: false,
    default: 'logs/app.log',
    validate: () => true,
    message: 'LOG_FILE should be a valid file path'
  },

  // ==================== MONITORING (OPTIONAL) ====================
  SENTRY_DSN: {
    required: false,
    sensitive: true,
    validate: (val) => !val || val.startsWith('https://'),
    message: 'SENTRY_DSN should be a valid Sentry DSN URL'
  }
};

/**
 * Validation result object
 */
class ValidationResult {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.appliedDefaults = [];
  }

  addError(key, message) {
    this.errors.push({ key, message });
  }

  addWarning(key, message) {
    this.warnings.push({ key, message });
  }

  addDefault(key, value) {
    this.appliedDefaults.push({ key, value });
  }

  get isValid() {
    return this.errors.length === 0;
  }
}

/**
 * Validate all environment variables
 * @returns {ValidationResult} - Validation result
 */
const validateEnv = () => {
  const result = new ValidationResult();

  console.log('🔍 Validating environment configuration...\n');

  for (const [key, config] of Object.entries(ENV_DEFINITIONS)) {
    const value = process.env[key];

    // Check if required
    if (config.required && !value) {
      result.addError(key, `${key} is required. ${config.message}`);
      continue;
    }

    // Apply default if not set
    if (!value && config.default !== undefined) {
      process.env[key] = config.default;
      result.addDefault(key, config.default);
      continue;
    }

    // Skip validation if not set and not required
    if (!value) {
      continue;
    }

    // Run validation function
    if (config.validate && !config.validate(value)) {
      if (config.required) {
        result.addError(key, config.message);
      } else {
        result.addWarning(key, config.message);
      }
    }
  }

  // Print results
  printValidationResults(result);

  // Exit on critical errors
  if (!result.isValid) {
    console.error('\n❌ Environment validation failed! Fix the errors above and restart.');
    process.exit(1);
  }

  return result;
};

/**
 * Print validation results to console
 * @param {ValidationResult} result - Validation result
 */
const printValidationResults = (result) => {
  // Print errors
  if (result.errors.length > 0) {
    console.error('❌ ERRORS:');
    result.errors.forEach(err => {
      console.error(`   • ${err.key}: ${err.message}`);
    });
    console.log('');
  }

  // Print warnings
  if (result.warnings.length > 0) {
    console.warn('⚠️  WARNINGS:');
    result.warnings.forEach(warn => {
      console.warn(`   • ${warn.key}: ${warn.message}`);
    });
    console.log('');
  }

  // Print applied defaults
  if (result.appliedDefaults.length > 0 && process.env.NODE_ENV !== 'production') {
    console.log('ℹ️  Applied defaults:');
    result.appliedDefaults.forEach(def => {
      console.log(`   • ${def.key} = ${def.value}`);
    });
    console.log('');
  }

  // Success message
  if (result.isValid) {
    console.log('✅ Environment configuration validated successfully\n');
  }
};

/**
 * Get environment variable with type conversion
 * @param {string} key - Environment variable key
 * @param {*} defaultValue - Default value if not set
 * @returns {*} - Typed value
 */
const getEnv = (key, defaultValue = undefined) => {
  const value = process.env[key];

  if (value === undefined) {
    return defaultValue;
  }

  // Auto-convert common types
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return parseInt(value);
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value);

  return value;
};

/**
 * Get multiple environment variables as object
 * @param {string[]} keys - Array of keys to get
 * @returns {Object} - Object with key-value pairs
 */
const getEnvMultiple = (keys) => {
  const result = {};
  keys.forEach(key => {
    result[key] = getEnv(key);
  });
  return result;
};

/**
 * Check if running in production
 * @returns {boolean}
 */
const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Check if running in development
 * @returns {boolean}
 */
const isDevelopment = () => process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

/**
 * Check if running in test
 * @returns {boolean}
 */
const isTest = () => process.env.NODE_ENV === 'test';

/**
 * Generate sample .env file
 * @param {string} outputPath - Path to write sample file
 */
const generateSampleEnv = (outputPath = '.env.example') => {
  let content = '# Table Mint POS - Environment Configuration\n';
  content += '# Generated on ' + new Date().toISOString() + '\n\n';

  const categories = {};

  // Group by category (based on comments in ENV_DEFINITIONS order)
  let currentCategory = 'General';
  for (const [key, config] of Object.entries(ENV_DEFINITIONS)) {
    if (!categories[currentCategory]) {
      categories[currentCategory] = [];
    }
    categories[currentCategory].push([key, config]);
  }

  for (const [key, config] of Object.entries(ENV_DEFINITIONS)) {
    const value = config.sensitive ? 'your-secret-here' : (config.default || '');
    const required = config.required ? '# REQUIRED' : '# Optional';
    content += `${required}\n`;
    content += `${key}=${value}\n\n`;
  }

  fs.writeFileSync(outputPath, content);
  console.log(`📝 Sample .env file generated at: ${outputPath}`);
};

module.exports = {
  validateEnv,
  getEnv,
  getEnvMultiple,
  isProduction,
  isDevelopment,
  isTest,
  generateSampleEnv,
  ENV_DEFINITIONS
};
