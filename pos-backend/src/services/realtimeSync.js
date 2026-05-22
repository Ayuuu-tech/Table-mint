/**
 * Real-time Sync Service using Socket.io
 * 
 * Enables real-time synchronization between:
 * - Web Dashboard (Owner)
 * - POS Screen (Cashier)
 * - Kitchen Display
 * 
 * Events:
 * - menu:update (Menu item price/availability change)
 * - order:new (New order placed)
 * - order:status (Order status update)
 * - bill:created (New bill generated)
 * - table:status (Table availability change)
 */

const socketIO = require('socket.io');

class RealtimeSyncService {
  constructor(server) {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001').split(',').map(o => o.trim());
    this.io = socketIO(server, {
      cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.setupMiddleware();
    this.setupEvents();
  }

  setupMiddleware() {
    // Verify JWT token on connection
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication failed: no token provided'));
      }

      try {
        const decoded = require('jsonwebtoken').verify(
          token,
          process.env.JWT_SECRET
        );
        socket.userId = decoded.id;
        socket.restaurantId = decoded.restaurantId;
        socket.role = decoded.role;
        next();
      } catch (error) {
        next(new Error('Authentication failed: invalid token'));
      }
    });
  }

  setupEvents() {
    this.io.on('connection', (socket) => {
      console.log(`✅ User ${socket.userId} connected to real-time sync`);

      // Join restaurant room for real-time updates
      socket.join(`restaurant:${socket.restaurantId}`);

      // --- MENU EVENTS ---
      socket.on('menu:available_toggle', (data) => {
        // Broadcast menu availability change to all devices
        this.io.to(`restaurant:${socket.restaurantId}`).emit('menu:available_updated', {
          menuItemId: data.menuItemId,
          isAvailable: data.isAvailable,
          updatedAt: new Date()
        });
      });

      socket.on('menu:price_update', (data) => {
        // Broadcast price update
        this.io.to(`restaurant:${socket.restaurantId}`).emit('menu:price_updated', {
          menuItemId: data.menuItemId,
          newPrice: data.newPrice,
          updatedAt: new Date()
        });
      });

      socket.on('menu:gst_update', (data) => {
        // Broadcast GST update
        this.io.to(`restaurant:${socket.restaurantId}`).emit('menu:gst_updated', {
          menuItemId: data.menuItemId,
          gstPercentage: data.gstPercentage,
          updatedAt: new Date()
        });
      });

      // --- TABLE EVENTS ---
      socket.on('table:status_update', (data) => {
        // Broadcast table status change
        this.io.to(`restaurant:${socket.restaurantId}`).emit('table:status_changed', {
          tableId: data.tableId,
          tableNumber: data.tableNumber,
          status: data.status,
          updatedAt: new Date()
        });
      });

      // --- ORDER EVENTS ---
      socket.on('order:new', (orderData) => {
        // New order placed - notify kitchen and dashboard
        this.io.to(`restaurant:${socket.restaurantId}`).emit('order:created', {
          orderId: orderData.orderId,
          tableNumber: orderData.tableNumber,
          items: orderData.items,
          totalAmount: orderData.totalAmount,
          createdAt: new Date()
        });

        // Send to kitchen display system
        this.io.to(`restaurant:${socket.restaurantId}`).emit('kitchen:new_order', {
          orderId: orderData.orderId,
          items: orderData.items,
          specialInstructions: orderData.specialInstructions
        });
      });

      socket.on('order:status_update', (data) => {
        // Order status change (OPEN → PENDING_PAYMENT → PAID)
        this.io.to(`restaurant:${socket.restaurantId}`).emit('order:status_changed', {
          orderId: data.orderId,
          status: data.status,
          updatedAt: new Date()
        });
      });

      socket.on('order:item_status', (data) => {
        // Individual item status (PENDING → PREPARING → READY)
        this.io.to(`restaurant:${socket.restaurantId}`).emit('order:item_ready', {
          orderId: data.orderId,
          itemId: data.itemId,
          itemName: data.itemName,
          status: data.status
        });
      });

      // --- BILL EVENTS ---
      socket.on('bill:created', (billData) => {
        // New bill generated
        this.io.to(`restaurant:${socket.restaurantId}`).emit('bill:generated', {
          billId: billData.billId,
          billNumber: billData.billNumber,
          tableNumber: billData.tableNumber,
          grandTotal: billData.grandTotal,
          createdAt: new Date()
        });
      });

      socket.on('bill:payment_received', (data) => {
        // Payment received
        this.io.to(`restaurant:${socket.restaurantId}`).emit('bill:paid', {
          billId: data.billId,
          paymentMode: data.paymentMode,
          amount: data.amount,
          paidAt: new Date()
        });
      });

      // --- SALES UPDATES (Real-time Dashboard) ---
      socket.on('request:sales_update', () => {
        // Request current sales summary
        socket.emit('sales:current_summary', {
          // This would be fetched from backend
          timestamp: new Date()
        });
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`❌ User ${socket.userId} disconnected`);
      });

      // Error handling
      socket.on('error', (error) => {
        console.error(`Socket error for user ${socket.userId}:`, error);
      });
    });
  }

  // Helper methods to emit events from backend
  notifyMenuUpdate(restaurantId, menuItemId, data) {
    this.io.to(`restaurant:${restaurantId}`).emit('menu:updated', {
      menuItemId,
      ...data,
      updatedAt: new Date()
    });
  }

  notifyNewOrder(restaurantId, orderData) {
    this.io.to(`restaurant:${restaurantId}`).emit('order:new', orderData);
  }

  notifyOrderStatus(restaurantId, orderId, status) {
    this.io.to(`restaurant:${restaurantId}`).emit('order:status_changed', {
      orderId,
      status,
      updatedAt: new Date()
    });
  }

  notifyBillGenerated(restaurantId, billData) {
    this.io.to(`restaurant:${restaurantId}`).emit('bill:created', billData);
  }

  notifyTableStatusChange(restaurantId, tableId, status) {
    this.io.to(`restaurant:${restaurantId}`).emit('table:status_changed', {
      tableId,
      status,
      updatedAt: new Date()
    });
  }
}

module.exports = RealtimeSyncService;
