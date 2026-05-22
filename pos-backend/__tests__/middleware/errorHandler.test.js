/**
 * Error Handler Middleware Tests
 * Tests for global error handling and custom error classes
 */

const {
    errorHandler,
    catchAsync,
    notFoundHandler,
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
} = require('../../src/middleware/errorHandler');

jest.mock('../../src/utils/logger', () => ({
    logError: jest.fn()
}));

describe('Error Handler Middleware', () => {
    let req, res, next;
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
        req = createMockRequest();
        res = createMockResponse();
        next = createMockNext();
        jest.clearAllMocks();
    });

    afterEach(() => {
        process.env.NODE_ENV = originalEnv;
    });

    describe('Custom Error Classes', () => {
        describe('AppError', () => {
            it('should create error with correct properties', () => {
                const error = new AppError('Test error', 500, 'TEST_ERROR');

                expect(error.message).toBe('Test error');
                expect(error.statusCode).toBe(500);
                expect(error.errorCode).toBe('TEST_ERROR');
                expect(error.isOperational).toBe(true);
                expect(error.status).toBe('error');
                expect(error.timestamp).toBeDefined();
            });

            it('should set status to fail for 4xx errors', () => {
                const error = new AppError('Bad request', 400);
                expect(error.status).toBe('fail');
            });

            it('should set status to error for 5xx errors', () => {
                const error = new AppError('Server error', 500);
                expect(error.status).toBe('error');
            });

            it('should have toJSON method', () => {
                const error = new AppError('Test', 400, 'TEST');
                const json = error.toJSON();

                expect(json).toHaveProperty('errorCode', 'TEST');
                expect(json).toHaveProperty('message', 'Test');
                expect(json).toHaveProperty('statusCode', 400);
                expect(json).toHaveProperty('timestamp');
            });
        });

        describe('ValidationError', () => {
            it('should create validation error with errors array', () => {
                const errors = [
                    { field: 'email', message: 'Invalid email' },
                    { field: 'password', message: 'Password required' }
                ];
                const error = new ValidationError('Validation failed', errors);

                expect(error.statusCode).toBe(400);
                expect(error.errorCode).toBe('VALIDATION_ERROR');
                expect(error.errors).toEqual(errors);
            });
        });

        describe('AuthenticationError', () => {
            it('should create authentication error', () => {
                const error = new AuthenticationError();

                expect(error.statusCode).toBe(401);
                expect(error.errorCode).toBe('AUTHENTICATION_ERROR');
                expect(error.message).toBe('Authentication failed');
            });

            it('should accept custom message', () => {
                const error = new AuthenticationError('Token expired');
                expect(error.message).toBe('Token expired');
            });
        });

        describe('AuthorizationError', () => {
            it('should create authorization error', () => {
                const error = new AuthorizationError();

                expect(error.statusCode).toBe(403);
                expect(error.errorCode).toBe('AUTHORIZATION_ERROR');
            });
        });

        describe('NotFoundError', () => {
            it('should create not found error with resource name', () => {
                const error = new NotFoundError('User', '123');

                expect(error.statusCode).toBe(404);
                expect(error.errorCode).toBe('NOT_FOUND');
                expect(error.message).toBe("User with ID '123' not found");
                expect(error.resource).toBe('User');
                expect(error.resourceId).toBe('123');
            });

            it('should work without ID', () => {
                const error = new NotFoundError('Resource');
                expect(error.message).toBe('Resource not found');
            });
        });

        describe('ConflictError', () => {
            it('should create conflict error', () => {
                const error = new ConflictError('Email already exists', 'email');

                expect(error.statusCode).toBe(409);
                expect(error.errorCode).toBe('CONFLICT');
                expect(error.field).toBe('email');
            });
        });

        describe('BusinessLogicError', () => {
            it('should create business logic error', () => {
                const error = new BusinessLogicError('Cannot cancel paid order', { orderId: '123' });

                expect(error.statusCode).toBe(422);
                expect(error.errorCode).toBe('BUSINESS_LOGIC_ERROR');
                expect(error.details).toEqual({ orderId: '123' });
            });
        });

        describe('RateLimitError', () => {
            it('should create rate limit error with retry-after', () => {
                const error = new RateLimitError('Too many requests', 120);

                expect(error.statusCode).toBe(429);
                expect(error.errorCode).toBe('RATE_LIMIT_EXCEEDED');
                expect(error.retryAfter).toBe(120);
            });
        });

        describe('DatabaseError', () => {
            it('should create database error', () => {
                const error = new DatabaseError('Connection failed');

                expect(error.statusCode).toBe(500);
                expect(error.errorCode).toBe('DATABASE_ERROR');
            });
        });

        describe('ExternalServiceError', () => {
            it('should create external service error', () => {
                const error = new ExternalServiceError('Payment Gateway', 'Service unavailable');

                expect(error.statusCode).toBe(502);
                expect(error.errorCode).toBe('EXTERNAL_SERVICE_ERROR');
                expect(error.serviceName).toBe('Payment Gateway');
                expect(error.message).toContain('Payment Gateway');
            });
        });
    });

    describe('errorHandler middleware', () => {
        describe('Development mode', () => {
            beforeEach(() => {
                process.env.NODE_ENV = 'development';
            });

            it('should include stack trace in development', () => {
                const error = new AppError('Test error', 400);

                errorHandler(error, req, res, next);

                expect(res.status).toHaveBeenCalledWith(400);
                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        success: false,
                        message: 'Test error',
                        stack: expect.any(String)
                    })
                );
            });
        });

        describe('Production mode', () => {
            beforeEach(() => {
                process.env.NODE_ENV = 'production';
            });

            it('should not include stack trace in production', () => {
                const error = new AppError('Test error', 400);

                errorHandler(error, req, res, next);

                expect(res.json).toHaveBeenCalledWith(
                    expect.not.objectContaining({ stack: expect.any(String) })
                );
            });

            it('should hide non-operational error details', () => {
                const error = new Error('Database password leak');
                error.isOperational = false;

                errorHandler(error, req, res, next);

                expect(res.status).toHaveBeenCalledWith(500);
                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        success: false,
                        message: 'An unexpected error occurred. Please try again later.'
                    })
                );
            });
        });

        describe('MongoDB Error Handling', () => {
            it('should handle CastError', () => {
                const error = new Error('Cast error');
                error.name = 'CastError';
                error.path = '_id';
                error.value = 'invalid-id';

                errorHandler(error, req, res, next);

                expect(res.status).toHaveBeenCalledWith(400);
            });

            it('should handle duplicate key error', () => {
                const error = new Error('Duplicate key');
                error.code = 11000;
                error.keyValue = { email: 'test@test.com' };

                errorHandler(error, req, res, next);

                expect(res.status).toHaveBeenCalledWith(409);
            });

            it('should handle validation error', () => {
                const error = new Error('Validation error');
                error.name = 'ValidationError';
                error.errors = {
                    email: { message: 'Invalid email', path: 'email' },
                    name: { message: 'Name required', path: 'name' }
                };

                errorHandler(error, req, res, next);

                expect(res.status).toHaveBeenCalledWith(400);
            });
        });

        describe('JWT Error Handling', () => {
            it('should handle JsonWebTokenError', () => {
                const error = new Error('jwt malformed');
                error.name = 'JsonWebTokenError';

                errorHandler(error, req, res, next);

                expect(res.status).toHaveBeenCalledWith(401);
            });

            it('should handle TokenExpiredError', () => {
                const error = new Error('jwt expired');
                error.name = 'TokenExpiredError';

                errorHandler(error, req, res, next);

                expect(res.status).toHaveBeenCalledWith(401);
            });
        });

        describe('Rate Limit Error', () => {
            it('should set Retry-After header', () => {
                const error = new RateLimitError('Too many requests', 120);

                process.env.NODE_ENV = 'production';
                errorHandler(error, req, res, next);

                expect(res.setHeader).toHaveBeenCalledWith('Retry-After', 120);
            });
        });
    });

    describe('catchAsync', () => {
        it('should pass resolved promise to next', async () => {
            const asyncFn = jest.fn().mockResolvedValue('success');
            const wrapped = catchAsync(asyncFn);

            await wrapped(req, res, next);

            expect(asyncFn).toHaveBeenCalledWith(req, res, next);
        });

        it('should pass rejected promise to next', async () => {
            const error = new Error('Async error');
            const asyncFn = jest.fn().mockRejectedValue(error);
            const wrapped = catchAsync(asyncFn);

            await wrapped(req, res, next);

            expect(next).toHaveBeenCalledWith(error);
        });

        it('should catch synchronous thrown errors via promise rejection', async () => {
            const error = new Error('Thrown error');
            // catchAsync uses Promise.resolve which converts sync throws to rejections
            const asyncFn = jest.fn().mockImplementation(async () => {
                throw error;
            });
            const wrapped = catchAsync(asyncFn);

            await wrapped(req, res, next);

            expect(next).toHaveBeenCalledWith(error);
        });
    });

    describe('notFoundHandler', () => {
        it('should create NotFoundError for undefined routes', () => {
            req.method = 'GET';
            req.originalUrl = '/api/nonexistent';

            notFoundHandler(req, res, next);

            expect(next).toHaveBeenCalledWith(
                expect.objectContaining({
                    statusCode: 404,
                    message: expect.stringContaining('Cannot GET /api/nonexistent')
                })
            );
        });
    });
});
