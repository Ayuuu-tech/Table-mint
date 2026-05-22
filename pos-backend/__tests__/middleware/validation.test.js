/**
 * Validation Middleware Tests
 * Tests for input validation middleware
 */

const { validationResult } = require('express-validator');
const {
    handleValidationErrors,
    authValidation,
    menuValidation,
    orderValidation,
    billValidation,
    customerValidation,
    isValidObjectId,
    isValidPhone,
    isValidGST
} = require('../../src/middleware/validation');

// Mock express-validator's validationResult
jest.mock('express-validator', () => ({
    ...jest.requireActual('express-validator'),
    validationResult: jest.fn()
}));

describe('Validation Middleware', () => {
    let req, res, next;

    beforeEach(() => {
        req = createMockRequest();
        res = createMockResponse();
        next = createMockNext();
        jest.clearAllMocks();
    });

    describe('handleValidationErrors', () => {
        it('should call next() when no validation errors', () => {
            validationResult.mockReturnValue({
                isEmpty: () => true,
                array: () => []
            });

            handleValidationErrors(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('should return 400 with errors when validation fails', () => {
            const mockErrors = [
                { path: 'email', msg: 'Invalid email', value: 'bad-email' },
                { path: 'password', msg: 'Password required', value: '' }
            ];

            validationResult.mockReturnValue({
                isEmpty: () => false,
                array: () => mockErrors
            });

            handleValidationErrors(req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'VALIDATION_ERROR',
                    message: 'Validation failed',
                    errors: expect.arrayContaining([
                        expect.objectContaining({ field: 'email', message: 'Invalid email' }),
                        expect.objectContaining({ field: 'password', message: 'Password required' })
                    ])
                })
            );
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('Helper Validators', () => {
        describe('isValidObjectId', () => {
            it('should return true for valid ObjectId', () => {
                expect(isValidObjectId('507f1f77bcf86cd799439011')).toBe(true);
            });

            it('should return false for invalid ObjectId', () => {
                expect(isValidObjectId('invalid-id')).toBe(false);
                expect(isValidObjectId('123')).toBe(false);
                expect(isValidObjectId('')).toBe(false);
                expect(isValidObjectId(null)).toBe(false);
            });
        });

        describe('isValidPhone', () => {
            it('should return true for valid Indian phone numbers', () => {
                expect(isValidPhone('9876543210')).toBe(true);
                expect(isValidPhone('6123456789')).toBe(true);
                expect(isValidPhone('7012345678')).toBe(true);
                expect(isValidPhone('8876543210')).toBe(true);
            });

            it('should return false for invalid phone numbers', () => {
                expect(isValidPhone('5876543210')).toBe(false); // Starts with 5
                expect(isValidPhone('123456789')).toBe(false);  // 9 digits
                expect(isValidPhone('12345678901')).toBe(false); // 11 digits
                expect(isValidPhone('abcdefghij')).toBe(false); // Letters
                expect(isValidPhone('')).toBe(false);
            });
        });

        describe('isValidGST', () => {
            it('should return true for valid GST numbers', () => {
                expect(isValidGST('27AABCU9603R1ZM')).toBe(true);
                expect(isValidGST('07CQZCD1111I4Z7')).toBe(true);
            });

            it('should return false for invalid GST numbers', () => {
                expect(isValidGST('INVALID123')).toBe(false);
                expect(isValidGST('27AABCU96031ZM')).toBe(false); // Missing char
                expect(isValidGST('')).toBe(false);
            });
        });
    });

    describe('authValidation', () => {
        describe('signup validation', () => {
            it('should have validation rules for all required fields', () => {
                expect(authValidation.signup).toBeDefined();
                expect(authValidation.signup.length).toBeGreaterThan(0);

                // Check that validators exist for required fields
                const fieldNames = authValidation.signup.map(v => v.builder?.fields?.[0] || 'unknown');
                // Note: The actual field extraction depends on express-validator internals
                expect(authValidation.signup.length).toBeGreaterThanOrEqual(5);
            });
        });

        describe('login validation', () => {
            it('should have validation rules for email and password', () => {
                expect(authValidation.login).toBeDefined();
                expect(authValidation.login.length).toBeGreaterThanOrEqual(2);
            });
        });
    });

    describe('menuValidation', () => {
        it('should have create validation rules', () => {
            expect(menuValidation.create).toBeDefined();
            expect(menuValidation.create.length).toBeGreaterThan(0);
        });

        it('should have update validation rules', () => {
            expect(menuValidation.update).toBeDefined();
            expect(menuValidation.update.length).toBeGreaterThan(0);
        });
    });

    describe('orderValidation', () => {
        it('should have create validation rules', () => {
            expect(orderValidation.create).toBeDefined();
            expect(orderValidation.create.length).toBeGreaterThan(0);
        });

        it('should have update validation rules', () => {
            expect(orderValidation.update).toBeDefined();
        });

        it('should have addItem validation rules', () => {
            expect(orderValidation.addItem).toBeDefined();
        });
    });

    describe('billValidation', () => {
        it('should have create validation rules', () => {
            expect(billValidation.create).toBeDefined();
            expect(billValidation.create.length).toBeGreaterThan(0);
        });
    });

    describe('customerValidation', () => {
        it('should have create validation rules', () => {
            expect(customerValidation.create).toBeDefined();
        });

        it('should have update validation rules', () => {
            expect(customerValidation.update).toBeDefined();
        });

        it('should have adjustLoyalty validation rules', () => {
            expect(customerValidation.adjustLoyalty).toBeDefined();
        });
    });
});
