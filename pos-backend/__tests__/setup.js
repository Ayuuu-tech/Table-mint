/**
 * Jest Setup File
 * Initialize test environment, mocks, and test utilities
 */

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/table_mint_test';
process.env.JWT_SECRET = 'test-secret-key-minimum-64-characters-required-for-jwt-secret-validation';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX_REQUESTS = '100';
process.env.FILE_UPLOAD_MAX_SIZE = '5242880';
process.env.API_TIMEOUT = '30000';

// Mock console for cleaner test output
global.console = {
  ...console,
  debug: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test utilities
global.createMockUser = (overrides = {}) => ({
  _id: 'test-user-123',
  name: 'Test User',
  email: 'test@example.com',
  phone: '9876543210',
  restaurantId: 'test-restaurant-123',
  role: 'OWNER',
  password: 'hashedpassword',
  createdAt: new Date(),
  ...overrides,
});

global.createMockRestaurant = (overrides = {}) => ({
  _id: 'test-restaurant-123',
  name: 'Test Restaurant',
  ownerName: 'Test Owner',
  email: 'owner@example.com',
  phone: '9876543210',
  address: {
    street: '123 Test St',
    city: 'Test City',
    state: 'TS',
    pincode: '123456',
  },
  subscriptionStatus: 'ACTIVE',
  createdAt: new Date(),
  ...overrides,
});

global.createMockMenuItem = (overrides = {}) => ({
  _id: 'test-item-123',
  restaurantId: 'test-restaurant-123',
  name: 'Test Item',
  description: 'Test Description',
  category: 'Starters',
  price: 199,
  availability: true,
  gstRate: 5,
  createdAt: new Date(),
  ...overrides,
});

global.createMockTable = (overrides = {}) => ({
  _id: 'test-table-123',
  restaurantId: 'test-restaurant-123',
  tableNumber: 'T001',
  capacity: 4,
  status: 'AVAILABLE',
  createdAt: new Date(),
  ...overrides,
});

// Test helper functions
global.createMockRequest = (overrides = {}) => ({
  headers: { authorization: 'Bearer test-token' },
  params: {},
  query: {},
  body: {},
  user: createMockUser(),
  restaurant: createMockRestaurant(),
  pagination: { page: 1, limit: 20, skip: 0 },
  ...overrides,
});

global.createMockResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    statusCode: 200,
  };
  return res;
};

global.createMockNext = () => jest.fn();

// Custom Jest matchers
expect.extend({
  toHaveBeenCalledOrRes(received) {
    // Check if mock was called or if res methods were used
    const pass = received.mock.calls.length > 0;
    if (pass) {
      return {
        message: () => `expected ${received} not to have been called`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to have been called`,
        pass: false
      };
    }
  }
});

