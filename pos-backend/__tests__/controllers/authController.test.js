/**
 * Auth Controller Tests
 * Unit tests for signup, login functionality
 */

const authController = require('../../src/controllers/authController');
const User = require('../../src/models/User');
const Restaurant = require('../../src/models/Restaurant');
const Subscription = require('../../src/models/Subscription');

// Mock all dependencies
jest.mock('../../src/models/User');
jest.mock('../../src/models/Restaurant');
jest.mock('../../src/models/Subscription');

// Mock the JWT secret manager properly
jest.mock('../../src/middleware/jwtSecretManager', () => ({
  getSecretManager: jest.fn(() => ({
    signJWT: jest.fn().mockReturnValue('test-jwt-token'),
    verifyJWT: jest.fn()
  })),
  generateToken: jest.fn().mockReturnValue('test-jwt-token')
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  logError: jest.fn(),
  logAuthEvent: jest.fn()
}));

describe('Auth Controller', () => {
  let req, res, next;

  beforeEach(() => {
    req = createMockRequest();
    res = createMockResponse();
    next = createMockNext();
    jest.clearAllMocks();
  });

  describe('Signup', () => {
    it('should successfully create a new restaurant and user', async () => {
      const mockRestaurant = createMockRestaurant();
      const mockUser = createMockUser();

      Restaurant.findOne = jest.fn().mockResolvedValue(null); // No existing restaurant
      Restaurant.create = jest.fn().mockResolvedValue(mockRestaurant);
      Subscription.create = jest.fn().mockResolvedValue({ _id: 'sub-123' });
      User.create = jest.fn().mockResolvedValue(mockUser);

      req.body = {
        restaurantName: 'Test Restaurant',
        ownerName: 'Test Owner',
        email: 'test@example.com',
        password: 'Password123',
        phone: '9876543210'
      };

      await authController.signup(req, res);

      expect(Restaurant.findOne).toHaveBeenCalled();
      expect(Restaurant.create).toHaveBeenCalled();
      expect(User.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            token: expect.any(String)
          })
        })
      );
    });

    it('should return error for existing restaurant email', async () => {
      Restaurant.findOne = jest.fn().mockResolvedValue({ _id: 'existing' });

      req.body = {
        restaurantName: 'Test Restaurant',
        ownerName: 'Test Owner',
        email: 'existing@example.com',
        password: 'Password123',
        phone: '9876543210'
      };

      await authController.signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('already exists')
        })
      );
    });

    it('should handle server error gracefully', async () => {
      Restaurant.findOne = jest.fn().mockRejectedValue(new Error('Database error'));

      req.body = {
        restaurantName: 'Test Restaurant',
        ownerName: 'Test Owner',
        email: 'test@example.com',
        password: 'Password123',
        phone: '9876543210'
      };

      await authController.signup(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('Login', () => {
    it('should successfully login with correct credentials', async () => {
      const mockUser = {
        _id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        role: 'OWNER',
        restaurantId: 'restaurant-123',
        isActive: true,
        comparePassword: jest.fn().mockResolvedValue(true)
      };
      const mockRestaurant = {
        _id: 'restaurant-123',
        name: 'Test Restaurant',
        isActive: true,
        logo: null,
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiry: new Date('2030-01-01'),
        settings: {}
      };

      User.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });
      Restaurant.findById = jest.fn().mockResolvedValue(mockRestaurant);

      req.body = {
        email: 'test@example.com',
        password: 'Password123'
      };

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            token: expect.any(String)
          })
        })
      );
    });

    it('should return 401 for non-existent user', async () => {
      User.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      req.body = {
        email: 'nonexistent@example.com',
        password: 'Password123'
      };

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false
        })
      );
    });

    it('should return 401 for wrong password', async () => {
      const mockUser = {
        _id: 'user-123',
        isActive: true,
        comparePassword: jest.fn().mockResolvedValue(false)
      };

      User.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      req.body = {
        email: 'test@example.com',
        password: 'WrongPassword'
      };

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return error when email/password not provided', async () => {
      req.body = {};

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('email and password')
        })
      );
    });
  });

  describe('getMe', () => {
    it('should return current user profile', async () => {
      const mockUser = {
        _id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        role: 'OWNER',
        restaurantId: 'restaurant-123',
        toObject: jest.fn().mockReturnValue({
          _id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
          role: 'OWNER',
          restaurantId: 'restaurant-123'
        })
      };
      const mockRestaurant = createMockRestaurant();

      // Setup proper mock chain
      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });
      Restaurant.findById = jest.fn().mockResolvedValue(mockRestaurant);

      req.user = { id: 'user-123', restaurantId: 'restaurant-123' };

      await authController.getMe(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            user: expect.any(Object)
          })
        })
      );
    });
  });
});
