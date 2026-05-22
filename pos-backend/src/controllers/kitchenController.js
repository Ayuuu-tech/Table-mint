const Order = require('../models/Order');
const { emitToRestaurant } = require('../services/realtimeSync');

/**
 * Get active orders for kitchen display
 * Returns orders with at least one item not SERVED
 */
exports.getKitchenOrders = async (req, res) => {
  try {
    const { restaurantId } = req.user;

    // Find orders where at least one item is not SERVED or order is still OPEN
    const orders = await Order.find({
      restaurantId,
      status: 'OPEN',
      'items.kitchenStatus': { $in: ['PENDING', 'PREPARING', 'READY'] }
    })
      .populate('tableId', 'tableNumber')
      .sort({ createdAt: 1 }) // Oldest first
      .lean();

    // Group items by status for quick filtering
    const pendingOrders = [];
    const preparingOrders = [];
    const readyOrders = [];

    orders.forEach(order => {
      const pending = order.items.filter(item => item.kitchenStatus === 'PENDING');
      const preparing = order.items.filter(item => item.kitchenStatus === 'PREPARING');
      const ready = order.items.filter(item => item.kitchenStatus === 'READY');

      if (pending.length) {
        pendingOrders.push({ ...order, items: pending, totalItems: order.items.length });
      }
      if (preparing.length) {
        preparingOrders.push({ ...order, items: preparing, totalItems: order.items.length });
      }
      if (ready.length) {
        readyOrders.push({ ...order, items: ready, totalItems: order.items.length });
      }
    });

    res.json({
      success: true,
      data: {
        pending: pendingOrders,
        preparing: preparingOrders,
        ready: readyOrders,
        allOrders: orders
      }
    });
  } catch (error) {
    console.error('Error fetching kitchen orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch kitchen orders',
      error: error.message
    });
  }
};

/**
 * Update single item kitchen status
 */
exports.updateItemStatus = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { status } = req.body;
    const { restaurantId } = req.user;

    if (!['PENDING', 'PREPARING', 'READY', 'SERVED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const order = await Order.findOne({ _id: orderId, restaurantId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in order'
      });
    }

    const oldStatus = item.kitchenStatus;
    item.kitchenStatus = status;

    // Track timing
    if (status === 'PREPARING' && !item.startedAt) {
      item.startedAt = new Date();
    }
    if (status === 'READY' && item.startedAt) {
      item.completedAt = new Date();
      item.prepTime = Math.round((item.completedAt - item.startedAt) / 60000); // minutes
    }

    await order.save();

    // Emit real-time update
    if (req.app.get('io')) {
      req.app.get('io').to(`restaurant:${restaurantId}`).emit('kitchen:item_status_changed', {
        orderId: order._id,
        orderNumber: order.tableNumber,
        itemId: item._id,
        itemName: item.name,
        oldStatus,
        newStatus: status,
        prepTime: item.prepTime,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: `Item marked as ${status}`,
      data: {
        orderId: order._id,
        item: {
          _id: item._id,
          name: item.name,
          kitchenStatus: item.kitchenStatus,
          startedAt: item.startedAt,
          completedAt: item.completedAt,
          prepTime: item.prepTime
        }
      }
    });
  } catch (error) {
    console.error('Error updating item status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update item status',
      error: error.message
    });
  }
};

/**
 * Bulk update multiple items to PREPARING
 * Useful for "Start All" button
 */
exports.bulkStartItems = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { itemIds } = req.body;
    const { restaurantId } = req.user;

    if (!Array.isArray(itemIds) || !itemIds.length) {
      return res.status(400).json({
        success: false,
        message: 'itemIds must be a non-empty array'
      });
    }

    const order = await Order.findOne({ _id: orderId, restaurantId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    let updatedCount = 0;
    const now = new Date();

    itemIds.forEach(itemId => {
      const item = order.items.id(itemId);
      if (item && item.kitchenStatus === 'PENDING') {
        item.kitchenStatus = 'PREPARING';
        item.startedAt = now;
        updatedCount++;
      }
    });

    await order.save();

    // Emit real-time update
    if (req.app.get('io')) {
      req.app.get('io').to(`restaurant:${restaurantId}`).emit('kitchen:bulk_started', {
        orderId: order._id,
        orderNumber: order.tableNumber,
        itemCount: updatedCount,
        timestamp: now
      });
    }

    res.json({
      success: true,
      message: `Started preparing ${updatedCount} items`,
      data: { updatedCount }
    });
  } catch (error) {
    console.error('Error bulk starting items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start items',
      error: error.message
    });
  }
};

/**
 * Get kitchen statistics
 */
exports.getKitchenStats = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const orders = await Order.find({
      restaurantId,
      createdAt: { $gte: today }
    });

    let totalItems = 0;
    let pendingItems = 0;
    let preparingItems = 0;
    let readyItems = 0;
    let servedItems = 0;
    let totalPrepTime = 0;
    let prepTimeCount = 0;

    orders.forEach(order => {
      order.items.forEach(item => {
        totalItems++;
        switch (item.kitchenStatus) {
          case 'PENDING':
            pendingItems++;
            break;
          case 'PREPARING':
            preparingItems++;
            break;
          case 'READY':
            readyItems++;
            break;
          case 'SERVED':
            servedItems++;
            break;
        }
        if (item.prepTime > 0) {
          totalPrepTime += item.prepTime;
          prepTimeCount++;
        }
      });
    });

    res.json({
      success: true,
      data: {
        totalItems,
        pendingItems,
        preparingItems,
        readyItems,
        servedItems,
        averagePrepTime: prepTimeCount > 0 ? Math.round(totalPrepTime / prepTimeCount) : 0,
        activeOrders: orders.filter(o => o.status === 'OPEN').length
      }
    });
  } catch (error) {
    console.error('Error fetching kitchen stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch kitchen statistics',
      error: error.message
    });
  }
};
