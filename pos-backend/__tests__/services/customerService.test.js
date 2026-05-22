const customerService = require('../../src/services/customerService');
const Customer = require('../../src/models/Customer');

jest.mock('../../src/models/Customer');

describe('Customer Service', () => {
    describe('findOrCreateCustomer', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should find matching customer by exact phone', async () => {
            const mockCustomer = { _id: 'cust123', name: 'John', phone: '9876543210' };
            Customer.findOne.mockResolvedValue(mockCustomer);
            Customer.findByIdAndUpdate.mockResolvedValue(mockCustomer);

            const result = await customerService.findOrCreateCustomer({
                restaurantId: 'rest123',
                phone: '9876543210',
                name: 'John'
            });

            expect(Customer.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    $or: expect.arrayContaining([{ phone: '9876543210' }])
                })
            );
            expect(result).toEqual(mockCustomer);
        });

        it('should find matching customer by fuzzy phone (last 10 digits)', async () => {
            const mockCustomer = { _id: 'cust123', name: 'John', phone: '+919876543210' };
            Customer.findOne.mockResolvedValue(mockCustomer);
            Customer.findByIdAndUpdate.mockResolvedValue(mockCustomer);

            // User provides 10 digit, DB has +91
            // OR User provides +91, DB has 10 digit (this depends on how we query)
            // Our logic checks: exact, last10, +91+last10, 0+last10

            await customerService.findOrCreateCustomer({
                restaurantId: 'rest123',
                phone: '9876543210', // User input
                name: 'John'
            });

            expect(Customer.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    $or: expect.arrayContaining([
                        { phone: '9876543210' },
                        { phone: '+919876543210' },
                        { phone: '09876543210' }
                    ])
                })
            );
        });

        it('should find matching customer when user provides prefixed phone', async () => {
            const mockCustomer = { _id: 'cust123', name: 'John', phone: '9876543210' };
            Customer.findOne.mockResolvedValue(mockCustomer);
            Customer.findByIdAndUpdate.mockResolvedValue(mockCustomer);

            await customerService.findOrCreateCustomer({
                restaurantId: 'rest123',
                phone: '+919876543210', // User input
                name: 'John'
            });

            expect(Customer.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    $or: expect.arrayContaining([
                        { phone: '9876543210' }
                    ])
                })
            );
        });
    });
});
