/**
 * Utility Tests
 * Test custom errors, pagination, and other utilities
 */

const {
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ConflictError,
  asyncHandler,
  formatValidationErrors,
} = require('../../src/utils/errors');

const {
  getPaginationParams,
  buildPaginatedResponse,
} = require('../../src/utils/pagination');

const {
  validateEnv,
  getEnv,
  isProduction,
  isDevelopment
} = require('../../src/utils/envValidation');

describe('Error Utilities', () => {
  describe('ValidationError', () => {
    it('should create validation error with 400 status', () => {
      const error = new ValidationError('Invalid email format');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid email format');
      expect(error.errorCode).toBe('VALIDATION_ERROR');
    });

    it('should include validation errors array', () => {
      const errors = [{ field: 'email', message: 'Invalid format' }];
      const error = new ValidationError('Validation failed', errors);
      expect(error.errors).toEqual(errors);
    });
  });

  describe('AuthenticationError', () => {
    it('should create auth error with 401 status', () => {
      const error = new AuthenticationError('Invalid credentials');
      expect(error.statusCode).toBe(401);
      expect(error.errorCode).toBe('AUTHENTICATION_ERROR');
    });

    it('should use default message if not provided', () => {
      const error = new AuthenticationError();
      expect(error.message).toBe('Authentication failed');
    });
  });

  describe('NotFoundError', () => {
    it('should create 404 error with resource and ID', () => {
      const error = new NotFoundError('User', '123');
      expect(error.statusCode).toBe(404);
      expect(error.errorCode).toBe('NOT_FOUND');
      expect(error.message).toContain('User');
      expect(error.message).toContain('123');
    });

    it('should work without ID', () => {
      const error = new NotFoundError('Resource');
      expect(error.message).toBe('Resource not found');
    });
  });

  describe('ConflictError', () => {
    it('should create 409 conflict error', () => {
      const error = new ConflictError('Email already exists');
      expect(error.statusCode).toBe(409);
      expect(error.errorCode).toBe('CONFLICT');
    });
  });

  describe('formatValidationErrors', () => {
    it('should format validation errors array', () => {
      const errors = [
        { param: 'email', msg: 'Invalid email' },
        { param: 'password', msg: 'Password too short' },
      ];

      const formatted = formatValidationErrors(errors);

      expect(formatted).toHaveLength(2);
      expect(formatted[0]).toEqual({
        field: 'email',
        message: 'Invalid email',
        value: undefined
      });
    });

    it('should handle empty errors array', () => {
      const formatted = formatValidationErrors([]);
      expect(formatted).toEqual([]);
    });
  });

  describe('asyncHandler', () => {
    it('should wrap async handler and catch errors', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      const handler = asyncHandler(async () => {
        throw new ValidationError('Test error');
      });

      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(ValidationError)
      );
    });

    it('should pass through successful responses', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      const handler = asyncHandler(async (req, res) => {
        res.json({ success: true });
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });
});

describe('Pagination Utilities', () => {
  describe('getPaginationParams', () => {
    it('should extract pagination from query params', () => {
      const req = createMockRequest({
        query: { page: '2', limit: '50' },
      });

      const pagination = getPaginationParams(req.query);

      expect(pagination.page).toBe(2);
      expect(pagination.limit).toBe(50);
      expect(pagination.skip).toBe(50);
    });

    it('should use defaults when params missing', () => {
      const req = createMockRequest({ query: {} });

      const pagination = getPaginationParams(req.query);

      expect(pagination.page).toBe(1);
      expect(pagination.limit).toBe(20);
      expect(pagination.skip).toBe(0);
    });

    it('should cap limit at 100', () => {
      const req = createMockRequest({
        query: { limit: '500' },
      });

      const pagination = getPaginationParams(req.query);

      expect(pagination.limit).toBe(100);
    });

    it('should handle page < 1', () => {
      const req = createMockRequest({
        query: { page: '0' },
      });

      const pagination = getPaginationParams(req.query);

      expect(pagination.page).toBe(1);
    });
  });

  describe('buildPaginatedResponse', () => {
    it('should build paginated response correctly', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const total = 42;
      const page = 1;
      const limit = 20;

      const response = buildPaginatedResponse(data, total, page, limit);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.pagination).toEqual({
        total: 42,
        page: 1,
        limit: 20,
        pages: 3,
        hasNextPage: true,
        hasPrevPage: false,
        nextPage: 2,
        prevPage: null,
      });
    });

    it('should handle last page correctly', () => {
      const data = [{ id: 1 }];
      const total = 21;
      const page = 2;
      const limit = 20;

      const response = buildPaginatedResponse(data, total, page, limit);

      expect(response.pagination.hasNextPage).toBe(false);
      expect(response.pagination.nextPage).toBeNull();
      expect(response.pagination.hasPrevPage).toBe(true);
    });

    it('should handle single page', () => {
      const data = [{ id: 1 }];
      const total = 1;
      const page = 1;
      const limit = 20;

      const response = buildPaginatedResponse(data, total, page, limit);

      expect(response.pagination.pages).toBe(1);
      expect(response.pagination.hasNextPage).toBe(false);
      expect(response.pagination.hasPrevPage).toBe(false);
    });
  });
});

describe('Environment Validation', () => {
  describe('getEnv', () => {
    it('should return default value when env not set', () => {
      const value = getEnv('NONEXISTENT_VAR', 'default');
      expect(value).toBe('default');
    });

    it('should convert string true to boolean', () => {
      process.env.TEST_BOOL = 'true';
      const value = getEnv('TEST_BOOL');
      expect(value).toBe(true);
      delete process.env.TEST_BOOL;
    });

    it('should convert numeric strings to numbers', () => {
      process.env.TEST_NUM = '42';
      const value = getEnv('TEST_NUM');
      expect(value).toBe(42);
      delete process.env.TEST_NUM;
    });
  });

  describe('environment helpers', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should correctly identify production', () => {
      process.env.NODE_ENV = 'production';
      expect(isProduction()).toBe(true);
      expect(isDevelopment()).toBe(false);
    });

    it('should correctly identify development', () => {
      process.env.NODE_ENV = 'development';
      expect(isDevelopment()).toBe(true);
      expect(isProduction()).toBe(false);
    });
  });

  describe('validateEnv', () => {
    it('should return validation result object', () => {
      // Note: This test relies on the test setup.js having valid env vars
      const result = validateEnv();
      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
    });
  });
});
