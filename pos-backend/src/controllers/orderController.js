const Order = require('../models/Order');
const Table = require('../models/Table');
const MenuItem = require('../models/MenuItem');
const Restaurant = require('../models/Restaurant');
const { findOrCreateCustomer } = require('../services/customerService');
const { sendNotification } = require('./notificationController');
const smsService = require('../services/smsService');

// @desc    Create new order (Open table)
// @route   POST /api/orders
// @access  Private
exports.createOrder = async (req, res) => {
  try {
    const { tableId, items, customerId, customerName, customerPhone, customerEmail } = req.body;

    let table = null;
    let tableNumber = 'Walk-in';

    // Handle walk-in orders (no tableId)
    if (tableId) {
      // Get table
      table = await Table.findById(tableId);
      if (!table) {
        return res.status(404).json({
          success: false,
          message: 'Table not found'
        });
      }

      // Check if table already has active order
      if (table.status === 'OCCUPIED' && table.currentOrderId) {
        return res.status(400).json({
          success: false,
          message: 'Table already has an active order'
        });
      }

      tableNumber = table.tableNumber;
    }

    // Get restaurant tax settings
    const restaurant = await Restaurant.findById(req.user.restaurantId);
    const taxPercentageSetting = restaurant?.settings?.taxPercentage || 0;
    
    // Process items with Variants and Modifiers (Feature 8)
    const orderItems = await Promise.all(
      items.map(async (item) => {
        const menuItem = await MenuItem.findById(item.menuItemId);
        if (!menuItem) {
          throw new Error(`Menu item ${item.menuItemId} not found`);
        }

        let finalPrice = menuItem.price;
        let variantData = undefined;

        // 1. Handle Variants
        if (item.selectedVariant) {
          const variantDef = menuItem.variants?.find(v => v.name === item.selectedVariant.name);
          if (variantDef) {
            finalPrice = variantDef.price;
            variantData = { name: variantDef.name, price: variantDef.price };
          }
        }

        // 2. Handle Modifiers
        let modifiersData = [];
        if (item.selectedModifiers && Array.isArray(item.selectedModifiers)) {
          item.selectedModifiers.forEach(mod => {
            const group = menuItem.modifierGroups?.find(g => g.name === mod.groupName);
            if (group) {
              const option = group.options?.find(o => o.name === mod.name);
              if (option) {
                finalPrice += option.price;
                modifiersData.push({
                  groupName: group.name,
                  name: option.name,
                  price: option.price
                });
              }
            }
          });
        }

        return {
          menuItemId: menuItem._id,
          name: menuItem.name,
          quantity: item.quantity,
          price: finalPrice,
          itemTotal: finalPrice * item.quantity,
          notes: item.notes || '',
          selectedVariant: variantData,
          selectedModifiers: modifiersData,
          // Feature 6: Tax Compliance
          taxRate: menuItem.taxRate ?? 5, // Default to 5% if not set
          hsnCode: menuItem.hsnCode
        };
      })
    );

    // Create order
    let customerRecord = null;
    if (customerId || customerName || customerPhone || customerEmail) {
      customerRecord = await findOrCreateCustomer({
        restaurantId: req.user.restaurantId,
        customerId,
        name: customerName || 'Guest Diner',
        phone: customerPhone,
        email: customerEmail,
        createdBy: req.user.id
      });
    }

    const orderData = {
      restaurantId: req.user.restaurantId,
      tableNumber,
      items: orderItems,
      taxPercentage: taxPercentageSetting,
      createdBy: req.user.id
    };

    if (customerRecord) {
      orderData.customer = customerRecord._id;
      orderData.customerName = customerRecord.name;
      orderData.customerPhone = customerRecord.phone;
      orderData.customerEmail = customerRecord.email;
    }

    // Add tableId only if it exists (not walk-in)
    if (tableId) {
      orderData.tableId = tableId;
    }

    const order = await Order.create(orderData);

    // Update table status only if it's not a walk-in order
    if (table) {
      table.status = 'OCCUPIED';
      table.currentOrderId = order._id;
      await table.save();
    }

    // CHECK: Large Order Alert (> 5000)
    const LARGE_ORDER_THRESHOLD = 5000;
    if (order.totalAmount >= LARGE_ORDER_THRESHOLD) {
      const notification = await sendNotification(
        req.user.restaurantId,
        {
          type: 'LARGE_ORDER',
          priority: 'HIGH',
          title: 'Large Order Received',
          message: `Table ${tableNumber} placed a large order of ₹${order.totalAmount}`,
          data: { orderId: order._id, amount: order.totalAmount },
          sentVia: ['IN_APP']
        }
      );
      
      // Emit socket for notification
      if (req.app.get('io')) {
        req.app.get('io').to(`restaurant:${req.user.restaurantId}`).emit('notification:new', notification);
      }
    }

    // CHECK: Send SMS Confirmation
    if (customerRecord && customerRecord.phone) {
      await smsService.sendOrderConfirmation(customerRecord.phone, tableNumber, order.totalAmount);
    }

    // Broadcast real-time new order
    const realtime = req.app.locals.realtime;
    if (realtime) {
      realtime.notifyNewOrder(req.user.restaurantId, {
        orderId: order._id,
        tableNumber,
        itemsCount: orderItems.length,
        totalAmount: order.totalAmount,
        createdBy: req.user.id,
        timestamp: new Date()
      });
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating order'
    });
  }
};

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
exports.getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('tableId')
      .populate('createdBy', 'name')
      .populate('customer', 'name phone email loyaltyPoints loyaltyTier');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching order'
    });
  }
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private
exports.getOrders = async (req, res) => {
  try {
    const { status, tableId } = req.query;
    
    const filter = { restaurantId: req.user.restaurantId };
    
    if (status) filter.status = status;
    if (tableId) filter.tableId = tableId;

    const orders = await Order.find(filter)
      .populate('tableId')
      .populate('createdBy', 'name')
      .populate('customer', 'name phone email loyaltyPoints loyaltyTier')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching orders'
    });
  }
};

// @desc    Update order (Add/Remove items, change quantity)
// @route   PUT /api/orders/:id
// @access  Private
exports.updateOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status !== 'OPEN') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update closed order'
      });
    }

    const { items, discount } = req.body;

    // Update items if provided
    if (items) {
      const orderItems = await Promise.all(
        items.map(async (item) => {
          const menuItem = await MenuItem.findById(item.menuItemId);
          if (!menuItem) {
            throw new Error(`Menu item ${item.menuItemId} not found`);
          }

          let finalPrice = menuItem.price;
          let variantData = undefined;

          // 1. Handle Variants
          if (item.selectedVariant) {
            const variantDef = menuItem.variants?.find(v => v.name === item.selectedVariant.name);
            if (variantDef) {
              finalPrice = variantDef.price;
              variantData = { name: variantDef.name, price: variantDef.price };
            }
          }

          // 2. Handle Modifiers
          let modifiersData = [];
          if (item.selectedModifiers && Array.isArray(item.selectedModifiers)) {
            item.selectedModifiers.forEach(mod => {
              const group = menuItem.modifierGroups?.find(g => g.name === mod.groupName);
              if (group) {
                const option = group.options?.find(o => o.name === mod.name);
                if (option) {
                  finalPrice += option.price;
                  modifiersData.push({
                    groupName: group.name,
                    name: option.name,
                    price: option.price
                  });
                }
              }
            });
          }

          return {
            menuItemId: menuItem._id,
            name: menuItem.name,
            quantity: item.quantity,
            price: finalPrice,
            itemTotal: finalPrice * item.quantity,
            notes: item.notes || '',
            selectedVariant: variantData,
            selectedModifiers: modifiersData
          };
        })
      );
      order.items = orderItems;
    }

    // Update discount if provided
    if (discount !== undefined) {
      order.discount = discount;
    }

    await order.save();

    // Broadcast real-time order status update
    const realtime = req.app.locals.realtime;
    if (realtime) {
      realtime.notifyOrderStatus(req.user.restaurantId, {
        orderId: order._id,
        status: order.status,
        itemsCount: order.items.length,
        totalAmount: order.totalAmount,
        updatedBy: req.user.id,
        timestamp: new Date()
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order updated successfully',
      data: order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating order'
    });
  }
};

// @desc    Add item to order
// @route   POST /api/orders/:id/items
// @access  Private
exports.addItemToOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status !== 'OPEN') {
      return res.status(400).json({
        success: false,
        message: 'Cannot add items to closed order'
      });
    }

    const { menuItemId, quantity, notes } = req.body;

    const menuItem = await MenuItem.findById(menuItemId);
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    // Check if item already exists in order
    const existingItemIndex = order.items.findIndex(
      item => item.menuItemId.toString() === menuItemId
    );

    if (existingItemIndex > -1) {
      // Update quantity
      order.items[existingItemIndex].quantity += quantity;
      order.items[existingItemIndex].itemTotal = 
        order.items[existingItemIndex].quantity * order.items[existingItemIndex].price;
    } else {
      // Add new item
      order.items.push({
        menuItemId: menuItem._id,
        name: menuItem.name,
        quantity,
        price: menuItem.price,
        itemTotal: menuItem.price * quantity,
        notes: notes || ''
      });
    }

    await order.save();

    res.status(200).json({
      success: true,
      message: 'Item added successfully',
      data: order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error adding item'
    });
  }
};

// @desc    Update item quantity
// @route   PATCH /api/orders/:orderId/items/:itemId
// @access  Private
exports.updateItemQuantity = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status !== 'OPEN') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update closed order'
      });
    }

    const { quantity } = req.body;

    const item = order.items.id(req.params.itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in order'
      });
    }

    if (quantity <= 0) {
      // Remove item
      order.items.pull(req.params.itemId);
    } else {
      // Update quantity
      item.quantity = quantity;
      item.itemTotal = item.price * quantity;
    }

    await order.save();

    res.status(200).json({
      success: true,
      message: 'Item quantity updated successfully',
      data: order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating quantity'
    });
  }
};

// @desc    Remove item from order
// @route   DELETE /api/orders/:orderId/items/:itemId
// @access  Private
exports.removeItemFromOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status !== 'OPEN') {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove items from closed order'
      });
    }

    order.items.pull(req.params.itemId);
    await order.save();

    res.status(200).json({
      success: true,
      message: 'Item removed successfully',
      data: order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error removing item'
    });
  }
};

// @desc    Cancel order
// @route   DELETE /api/orders/:id
// @access  Private
exports.cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status !== 'OPEN') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel closed order'
      });
    }

    order.status = 'CANCELLED';
    order.closedAt = Date.now();
    await order.save();

    // Update table status
    const table = await Table.findById(order.tableId);
    if (table) {
      table.status = 'AVAILABLE';
      table.currentOrderId = null;
      await table.save();
    }

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error cancelling order'
    });
  }
};
