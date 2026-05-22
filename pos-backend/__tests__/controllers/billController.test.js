/**
 * Bill Controller Tests
 * Unit tests for bill generation and payment processing
 */

const billController = require('../../src/controllers/billController');
const Bill = require('../../src/models/Bill');
const Order = require('../../src/models/Order');
const Table = require('../../src/models/Table');
const MenuItem = require('../../src/models/MenuItem');
const Restaurant = require('../../src/models/Restaurant');
const Customer = require('../../src/models/Customer');

jest.mock('../../src/models/Bill');
jest.mock('../../src/models/Order');
jest.mock('../../src/models/Table');
jest.mock('../../src/models/MenuItem');
jest.mock('../../src/models/Restaurant');
jest.mock('../../src/models/Customer');
jest.mock('../../src/services/customerService');
jest.mock('../../src/services/inventoryService');
jest.mock('../../src/services/smsService');
jest.mock('../../src/controllers/notificationController');
jest.mock('qrcode');
jest.mock('../../src/utils/logger', () => ({
    logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    logError: jest.fn(),
    logPaymentEvent: jest.fn()
}));

describe('Bill Controller', () => {
    let req, res, next;

    beforeEach(() => {
        req = createMockRequest();
        res = createMockResponse();
        next = createMockNext();
        jest.clearAllMocks();

        req.app = {
            locals: { realtime: null },
            get: jest.fn().mockReturnValue(null)
        };
    });

    describe('generateBill', () => {
        const mockOrder = {
            _id: 'order-123',
            restaurantId: 'restaurant-123',
            tableNumber: 'T001',
            tableId: 'table-123',
            status: 'OPEN',
            items: [
                {
                    menuItemId: 'item-123',
                    name: 'Test Item',
                    quantity: 2,
                    price: 200,
                    itemTotal: 400,
                    taxRate: 5
                }
            ],
            subtotal: 400,
            tax: 20,
            discount: 0,
            totalAmount: 420,
            save: jest.fn().mockResolvedValue({ status: 'PAID' })
        };

        const mockBill = {
            _id: 'bill-123',
            billNumber: 'INV-2526-0001',
            orderId: 'order-123',
            tableNumber: 'T001',
            items: mockOrder.items,
            subtotal: 400,
            tax: 20,
            taxBreakdown: { cgst: 10, sgst: 10, igst: 0, cess: 0 },
            totalAmount: 420,
            paymentMode: 'CASH',
            paymentStatus: 'PAID'
        };

        beforeEach(() => {
            // Reset all mocks with proper chain
            Order.findById = jest.fn().mockResolvedValue({
                ...mockOrder,
                save: jest.fn().mockResolvedValue({ status: 'PAID' })
            });
            Restaurant.findById = jest.fn().mockResolvedValue(createMockRestaurant());
            MenuItem.find = jest.fn().mockResolvedValue([{ _id: 'item-123', taxRate: 5 }]);
            Bill.create = jest.fn().mockResolvedValue(mockBill);
            Table.findById = jest.fn().mockResolvedValue({
                _id: 'table-123',
                status: 'OCCUPIED',
                currentOrderId: 'order-123',
                save: jest.fn().mockResolvedValue({ status: 'AVAILABLE' })
            });
        });

        it('should generate bill successfully with CASH payment', async () => {
            req.body = {
                orderId: 'order-123',
                paymentMode: 'CASH'
            };

            await billController.generateBill(req, res);

            expect(Order.findById).toHaveBeenCalledWith('order-123');
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Bill generated successfully'
                })
            );
        });

        it('should return 404 if order not found', async () => {
            Order.findById = jest.fn().mockResolvedValue(null);

            req.body = {
                orderId: 'nonexistent-order',
                paymentMode: 'CASH'
            };

            await billController.generateBill(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Order not found'
                })
            );
        });

        it('should return 400 if order is already closed', async () => {
            Order.findById = jest.fn().mockResolvedValue({
                ...mockOrder,
                status: 'PAID'
            });

            req.body = {
                orderId: 'order-123',
                paymentMode: 'CASH'
            };

            await billController.generateBill(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Order is already closed'
                })
            );
        });

        it('should successfully create bill with any valid payment mode', async () => {
            const paymentModes = ['CASH', 'UPI', 'CARD'];

            for (const mode of paymentModes) {
                jest.clearAllMocks();

                Order.findById = jest.fn().mockResolvedValue({
                    ...mockOrder,
                    save: jest.fn().mockResolvedValue({ status: 'PAID' })
                });
                Restaurant.findById = jest.fn().mockResolvedValue(createMockRestaurant());
                MenuItem.find = jest.fn().mockResolvedValue([{ _id: 'item-123', taxRate: 5 }]);
                Bill.create = jest.fn().mockResolvedValue({ ...mockBill, paymentMode: mode });
                Table.findById = jest.fn().mockResolvedValue({
                    _id: 'table-123',
                    status: 'OCCUPIED',
                    save: jest.fn().mockResolvedValue({ status: 'AVAILABLE' })
                });

                req.body = {
                    orderId: 'order-123',
                    paymentMode: mode
                };

                await billController.generateBill(req, res);

                expect(res.status).toHaveBeenCalledWith(201);
            }
        });
    });

    describe('getBills', () => {
        it('should return all bills for restaurant', async () => {
            const mockBills = [
                { _id: 'bill-1', billNumber: 'INV-2526-0001' },
                { _id: 'bill-2', billNumber: 'INV-2526-0002' }
            ];

            Bill.find = jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockReturnValue({
                        sort: jest.fn().mockReturnValue({
                            limit: jest.fn().mockResolvedValue(mockBills)
                        })
                    })
                })
            });

            await billController.getBills(req, res);

            expect(Bill.find).toHaveBeenCalledWith(
                expect.objectContaining({ restaurantId: req.user.restaurantId })
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    count: 2,
                    data: mockBills
                })
            );
        });

        it('should filter bills by date range', async () => {
            req.query.startDate = '2026-01-01';
            req.query.endDate = '2026-01-31';

            Bill.find = jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockReturnValue({
                        sort: jest.fn().mockReturnValue({
                            limit: jest.fn().mockResolvedValue([])
                        })
                    })
                })
            });

            await billController.getBills(req, res);

            expect(Bill.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    createdAt: expect.objectContaining({
                        $gte: expect.any(Date),
                        $lte: expect.any(Date)
                    })
                })
            );
        });

        it('should filter bills by payment mode', async () => {
            req.query.paymentMode = 'CASH';

            Bill.find = jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockReturnValue({
                        sort: jest.fn().mockReturnValue({
                            limit: jest.fn().mockResolvedValue([])
                        })
                    })
                })
            });

            await billController.getBills(req, res);

            expect(Bill.find).toHaveBeenCalledWith(
                expect.objectContaining({ paymentMode: 'CASH' })
            );
        });
    });

    describe('getBill', () => {
        it('should return bill by ID', async () => {
            const mockBill = {
                _id: 'bill-123',
                billNumber: 'INV-2526-0001',
                totalAmount: 500
            };

            Bill.findById = jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockReturnValue({
                        populate: jest.fn().mockResolvedValue(mockBill)
                    })
                })
            });

            req.params.id = 'bill-123';

            await billController.getBill(req, res);

            expect(Bill.findById).toHaveBeenCalledWith('bill-123');
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: mockBill
                })
            );
        });

        it('should return 404 if bill not found', async () => {
            Bill.findById = jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockReturnValue({
                        populate: jest.fn().mockResolvedValue(null)
                    })
                })
            });

            req.params.id = 'nonexistent-bill';

            await billController.getBill(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe('getBillByNumber', () => {
        it('should return bill by bill number', async () => {
            const mockBill = {
                _id: 'bill-123',
                billNumber: 'INV-2526-0001'
            };

            Bill.findOne = jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockResolvedValue(mockBill)
                })
            });

            req.params.billNumber = 'INV-2526-0001';

            await billController.getBillByNumber(req, res);

            expect(Bill.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    billNumber: 'INV-2526-0001',
                    restaurantId: req.user.restaurantId
                })
            );
            expect(res.status).toHaveBeenCalledWith(200);
        });
    });

    describe('reportFailedPayment', () => {
        it('should create notification for failed payment', async () => {
            const { sendNotification } = require('../../src/controllers/notificationController');
            sendNotification.mockResolvedValue({ _id: 'notification-123' });

            req.body = {
                amount: 500,
                customerName: 'John Doe',
                reason: 'Card declined',
                tableNumber: 'T001'
            };

            await billController.reportFailedPayment(req, res);

            expect(sendNotification).toHaveBeenCalledWith(
                req.user.restaurantId,
                expect.objectContaining({
                    type: 'FAILED_PAYMENT',
                    priority: 'URGENT'
                })
            );
            expect(res.status).toHaveBeenCalledWith(200);
        });
    });

    describe('generatePaymentQR', () => {
        it('should generate UPI QR code', async () => {
            const QRCode = require('qrcode');
            QRCode.toDataURL = jest.fn().mockResolvedValue('data:image/png;base64,..qrcode..');

            Restaurant.findById = jest.fn().mockResolvedValue({
                name: 'Test Restaurant',
                paymentSettings: { upiId: 'test@upi' }
            });

            req.body = { amount: 500, note: 'Bill Payment' };

            await billController.generatePaymentQR(req, res);

            expect(QRCode.toDataURL).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        qrCode: expect.any(String),
                        upiString: expect.stringContaining('upi://pay')
                    })
                })
            );
        });

        it('should return 400 if amount not provided', async () => {
            req.body = {};

            await billController.generatePaymentQR(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Amount is required'
                })
            );
        });
    });
});
