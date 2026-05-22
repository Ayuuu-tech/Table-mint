/**
 * Order Controller Tests
 * Unit tests for order CRUD operations
 */

const orderController = require('../../src/controllers/orderController');
const Order = require('../../src/models/Order');
const Table = require('../../src/models/Table');
const MenuItem = require('../../src/models/MenuItem');
const Restaurant = require('../../src/models/Restaurant');

jest.mock('../../src/models/Order');
jest.mock('../../src/models/Table');
jest.mock('../../src/models/MenuItem');
jest.mock('../../src/models/Restaurant');
jest.mock('../../src/services/customerService');
jest.mock('../../src/services/smsService');
jest.mock('../../src/controllers/notificationController');

describe('Order Controller', () => {
    let req, res, next;

    beforeEach(() => {
        req = createMockRequest();
        res = createMockResponse();
        next = createMockNext();
        jest.clearAllMocks();

        // Setup common mocks
        req.app = {
            locals: { realtime: null },
            get: jest.fn().mockReturnValue(null)
        };
    });

    describe('createOrder', () => {
        it('should create a new order successfully', async () => {
            const mockTable = createMockTable({ _id: 'table-123', status: 'AVAILABLE' });
            const mockMenuItem = createMockMenuItem({ _id: 'item-123', price: 200, taxRate: 5 });
            const mockRestaurant = createMockRestaurant();
            const mockOrder = {
                _id: 'order-123',
                tableNumber: 'T001',
                items: [{ menuItemId: 'item-123', name: 'Test Item', quantity: 2, price: 200, itemTotal: 400 }],
                subtotal: 400,
                tax: 20,
                totalAmount: 420,
                save: jest.fn()
            };

            Table.findById = jest.fn().mockResolvedValue(mockTable);
            MenuItem.findById = jest.fn().mockResolvedValue(mockMenuItem);
            Restaurant.findById = jest.fn().mockResolvedValue(mockRestaurant);
            Order.create = jest.fn().mockResolvedValue(mockOrder);
            mockTable.save = jest.fn().mockResolvedValue(mockTable);

            req.body = {
                tableId: 'table-123',
                items: [{ menuItemId: 'item-123', quantity: 2 }]
            };

            await orderController.createOrder(req, res);

            expect(Table.findById).toHaveBeenCalledWith('table-123');
            expect(MenuItem.findById).toHaveBeenCalledWith('item-123');
            expect(Order.create).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Order created successfully'
                })
            );
        });

        it('should create walk-in order without table', async () => {
            const mockMenuItem = createMockMenuItem({ _id: 'item-123' });
            const mockRestaurant = createMockRestaurant();
            const mockOrder = {
                _id: 'order-123',
                tableNumber: 'Walk-in',
                items: [],
                subtotal: 200,
                tax: 10,
                totalAmount: 210
            };

            MenuItem.findById = jest.fn().mockResolvedValue(mockMenuItem);
            Restaurant.findById = jest.fn().mockResolvedValue(mockRestaurant);
            Order.create = jest.fn().mockResolvedValue(mockOrder);

            req.body = {
                items: [{ menuItemId: 'item-123', quantity: 1 }]
            };

            await orderController.createOrder(req, res);

            expect(Table.findById).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
        });

        it('should return 404 if table not found', async () => {
            Table.findById = jest.fn().mockResolvedValue(null);

            req.body = {
                tableId: 'nonexistent-table',
                items: [{ menuItemId: 'item-123', quantity: 1 }]
            };

            await orderController.createOrder(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Table not found'
                })
            );
        });

        it('should return 400 if table is already occupied', async () => {
            const mockTable = createMockTable({
                status: 'OCCUPIED',
                currentOrderId: 'existing-order'
            });

            Table.findById = jest.fn().mockResolvedValue(mockTable);

            req.body = {
                tableId: 'table-123',
                items: [{ menuItemId: 'item-123', quantity: 1 }]
            };

            await orderController.createOrder(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Table already has an active order'
                })
            );
        });
    });

    describe('getOrder', () => {
        it('should return order by ID', async () => {
            const mockOrder = {
                _id: 'order-123',
                tableNumber: 'T001',
                items: [],
                totalAmount: 500
            };

            Order.findById = jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockReturnValue({
                        populate: jest.fn().mockResolvedValue(mockOrder)
                    })
                })
            });

            req.params.id = 'order-123';

            await orderController.getOrder(req, res);

            expect(Order.findById).toHaveBeenCalledWith('order-123');
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: mockOrder
                })
            );
        });

        it('should return 404 if order not found', async () => {
            Order.findById = jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockReturnValue({
                        populate: jest.fn().mockResolvedValue(null)
                    })
                })
            });

            req.params.id = 'nonexistent-order';

            await orderController.getOrder(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe('getOrders', () => {
        it('should return all orders for restaurant', async () => {
            const mockOrders = [
                { _id: 'order-1', tableNumber: 'T001' },
                { _id: 'order-2', tableNumber: 'T002' }
            ];

            Order.find = jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockReturnValue({
                        populate: jest.fn().mockReturnValue({
                            sort: jest.fn().mockResolvedValue(mockOrders)
                        })
                    })
                })
            });

            await orderController.getOrders(req, res);

            expect(Order.find).toHaveBeenCalledWith(
                expect.objectContaining({ restaurantId: req.user.restaurantId })
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    count: 2,
                    data: mockOrders
                })
            );
        });

        it('should filter orders by status', async () => {
            req.query.status = 'OPEN';

            Order.find = jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockReturnValue({
                        populate: jest.fn().mockReturnValue({
                            sort: jest.fn().mockResolvedValue([])
                        })
                    })
                })
            });

            await orderController.getOrders(req, res);

            expect(Order.find).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'OPEN' })
            );
        });
    });

    describe('updateOrder', () => {
        it('should update order items', async () => {
            const mockOrder = {
                _id: 'order-123',
                status: 'OPEN',
                items: [],
                save: jest.fn().mockResolvedValue({ _id: 'order-123' })
            };
            const mockMenuItem = createMockMenuItem();

            Order.findById = jest.fn().mockResolvedValue(mockOrder);
            MenuItem.findById = jest.fn().mockResolvedValue(mockMenuItem);

            req.params.id = 'order-123';
            req.body = {
                items: [{ menuItemId: 'item-123', quantity: 3 }]
            };

            await orderController.updateOrder(req, res);

            expect(mockOrder.save).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should not update closed order', async () => {
            const mockOrder = { _id: 'order-123', status: 'PAID' };
            Order.findById = jest.fn().mockResolvedValue(mockOrder);

            req.params.id = 'order-123';
            req.body = { items: [] };

            await orderController.updateOrder(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Cannot update closed order'
                })
            );
        });
    });

    describe('cancelOrder', () => {
        it('should cancel order and release table', async () => {
            const mockOrder = {
                _id: 'order-123',
                status: 'OPEN',
                tableId: 'table-123',
                save: jest.fn().mockResolvedValue({ _id: 'order-123', status: 'CANCELLED' })
            };
            const mockTable = {
                _id: 'table-123',
                status: 'OCCUPIED',
                save: jest.fn().mockResolvedValue({ status: 'AVAILABLE' })
            };

            Order.findById = jest.fn().mockResolvedValue(mockOrder);
            Table.findById = jest.fn().mockResolvedValue(mockTable);

            req.params.id = 'order-123';

            await orderController.cancelOrder(req, res);

            expect(mockOrder.save).toHaveBeenCalled();
            expect(mockOrder.status).toBe('CANCELLED');
            expect(mockTable.status).toBe('AVAILABLE');
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should not cancel already closed order', async () => {
            const mockOrder = { _id: 'order-123', status: 'PAID' };
            Order.findById = jest.fn().mockResolvedValue(mockOrder);

            req.params.id = 'order-123';

            await orderController.cancelOrder(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });
    });

    describe('addItemToOrder', () => {
        it('should add new item to order', async () => {
            const mockOrder = {
                _id: 'order-123',
                status: 'OPEN',
                items: [],
                save: jest.fn().mockResolvedValue({ _id: 'order-123' })
            };
            const mockMenuItem = createMockMenuItem({ _id: 'item-123', price: 200 });

            Order.findById = jest.fn().mockResolvedValue(mockOrder);
            MenuItem.findById = jest.fn().mockResolvedValue(mockMenuItem);
            mockOrder.items.findIndex = jest.fn().mockReturnValue(-1);
            mockOrder.items.push = jest.fn();

            req.params.id = 'order-123';
            req.body = { menuItemId: 'item-123', quantity: 2 };

            await orderController.addItemToOrder(req, res);

            expect(mockOrder.save).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should increase quantity if item exists', async () => {
            const existingItem = {
                menuItemId: { toString: () => 'item-123' },
                quantity: 1,
                price: 200,
                itemTotal: 200
            };
            const mockOrder = {
                _id: 'order-123',
                status: 'OPEN',
                items: [existingItem],
                save: jest.fn().mockResolvedValue({ _id: 'order-123' })
            };
            const mockMenuItem = createMockMenuItem({ _id: 'item-123' });

            Order.findById = jest.fn().mockResolvedValue(mockOrder);
            MenuItem.findById = jest.fn().mockResolvedValue(mockMenuItem);

            req.params.id = 'order-123';
            req.body = { menuItemId: 'item-123', quantity: 2 };

            await orderController.addItemToOrder(req, res);

            expect(existingItem.quantity).toBe(3);
            expect(res.status).toHaveBeenCalledWith(200);
        });
    });

    describe('updateItemQuantity', () => {
        it('should update item quantity', async () => {
            const mockItem = {
                _id: 'item-id-123',
                quantity: 2,
                price: 100,
                itemTotal: 200
            };
            const mockOrder = {
                _id: 'order-123',
                status: 'OPEN',
                items: {
                    id: jest.fn().mockReturnValue(mockItem),
                    pull: jest.fn()
                },
                save: jest.fn().mockResolvedValue({ _id: 'order-123' })
            };

            Order.findById = jest.fn().mockResolvedValue(mockOrder);

            req.params.orderId = 'order-123';
            req.params.itemId = 'item-id-123';
            req.body = { quantity: 5 };

            await orderController.updateItemQuantity(req, res);

            expect(mockItem.quantity).toBe(5);
            expect(mockOrder.save).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should remove item when quantity is 0', async () => {
            const mockItem = { _id: 'item-id-123', quantity: 1 };
            const mockOrder = {
                _id: 'order-123',
                status: 'OPEN',
                items: {
                    id: jest.fn().mockReturnValue(mockItem),
                    pull: jest.fn()
                },
                save: jest.fn().mockResolvedValue({ _id: 'order-123' })
            };

            Order.findById = jest.fn().mockResolvedValue(mockOrder);

            req.params.orderId = 'order-123';
            req.params.itemId = 'item-id-123';
            req.body = { quantity: 0 };

            await orderController.updateItemQuantity(req, res);

            expect(mockOrder.items.pull).toHaveBeenCalledWith('item-id-123');
            expect(mockOrder.save).toHaveBeenCalled();
        });
    });
});
