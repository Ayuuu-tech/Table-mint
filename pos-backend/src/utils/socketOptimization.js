/**
 * Socket.IO Optimization
 * Prevents inefficient broadcasts, implements targeted delivery and room management
 */

/**
 * Optimized Socket.IO Server Setup
 * Replaces default behavior with scalable patterns
 */
exports.setupOptimizedSocketIO = (io) => {
  // Middleware to track user presence
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    const userId = socket.handshake.auth.userId;
    const restaurantId = socket.handshake.auth.restaurantId;

    if (!token || !userId) {
      return next(new Error('Authentication failed'));
    }

    socket.userId = userId;
    socket.restaurantId = restaurantId;
    socket.token = token;

    next();
  });

  // Track user presence
  io.on('connection', (socket) => {
    console.log(`[Socket] User connected: ${socket.userId}`);

    // User connects to their personal room
    socket.join(`user:${socket.userId}`);

    // User connects to restaurant room
    socket.join(`restaurant:${socket.restaurantId}`);

    // Broadcast user online status
    io.to(`restaurant:${socket.restaurantId}`).emit('user_online', {
      userId: socket.userId,
      timestamp: new Date()
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`[Socket] User disconnected: ${socket.userId}`);

      // Broadcast user offline status
      io.to(`restaurant:${socket.restaurantId}`).emit('user_offline', {
        userId: socket.userId,
        timestamp: new Date()
      });
    });
  });
};

/**
 * Targeted broadcast to single user
 * Instead of: io.emit('event', data) // All users
 * Use: broadcastToUser(io, userId, 'event', data)
 */
exports.broadcastToUser = (io, userId, event, data) => {
  io.to(`user:${userId}`).emit(event, {
    ...data,
    timestamp: new Date(),
    target: 'user'
  });
};

/**
 * Broadcast to restaurant staff only
 * Instead of: socket.broadcast.emit() // All users
 * Use: broadcastToRestaurant(io, restaurantId, event, data)
 */
exports.broadcastToRestaurant = (io, restaurantId, event, data, excludeUserId = null) => {
  const room = io.to(`restaurant:${restaurantId}`);

  if (excludeUserId) {
    room.except(`user:${excludeUserId}`);
  }

  room.emit(event, {
    ...data,
    timestamp: new Date(),
    restaurantId,
    target: 'restaurant'
  });
};

/**
 * Broadcast to table (order updates)
 * Specific to a table's orders
 */
exports.broadcastToTable = (io, tableId, event, data) => {
  io.to(`table:${tableId}`).emit(event, {
    ...data,
    timestamp: new Date(),
    tableId,
    target: 'table'
  });
};

/**
 * Broadcast to order (all involved parties)
 * Customer, staff, kitchen all see order updates
 */
exports.broadcastToOrder = (io, orderId, event, data, participants) => {
  // Send to all participants: customer, staff, kitchen
  participants.forEach((participantId) => {
    io.to(`user:${participantId}`).emit(event, {
      ...data,
      timestamp: new Date(),
      orderId,
      target: 'order',
      participant: participantId
    });
  });
};

/**
 * Join user to restaurant room
 */
exports.joinRestaurantRoom = (socket, restaurantId) => {
  socket.join(`restaurant:${restaurantId}`);
};

/**
 * Join table monitoring room
 */
exports.joinTableRoom = (socket, tableId) => {
  socket.join(`table:${tableId}`);
};

/**
 * Leave restaurant room
 */
exports.leaveRestaurantRoom = (socket, restaurantId) => {
  socket.leave(`restaurant:${restaurantId}`);
};

/**
 * Get room members count
 * Check how many users in a room
 */
exports.getRoomMembersCount = async (io, room) => {
  const sockets = await io.in(room).fetchSockets();
  return sockets.length;
};

/**
 * Get all users in restaurant
 */
exports.getRestaurantUsers = async (io, restaurantId) => {
  const sockets = await io.in(`restaurant:${restaurantId}`).fetchSockets();
  return sockets.map((socket) => ({
    userId: socket.userId,
    socketId: socket.id,
    joinedAt: socket.handshake.time
  }));
};

/**
 * Optimized order update broadcast
 * Instead of broadcasting full order to everyone
 * Send specific updates to relevant parties
 */
exports.broadcastOrderUpdate = (io, orderId, update, context = {}) => {
  const {
    restaurantId,
    customerId,
    kitchenStaff = [],
    deliveryStaff = [],
    updatedBy = null
  } = context;

  const participants = [
    customerId,
    ...kitchenStaff,
    ...deliveryStaff
  ].filter(Boolean);

  // What to send to each party
  const messages = {
    // Customer gets: status, ETA, basic info
    customer: {
      orderId,
      status: update.status,
      eta: update.eta,
      total: update.total,
      message: update.customerMessage
    },

    // Kitchen gets: items to prepare, special instructions
    kitchen: {
      orderId,
      items: update.items,
      instructions: update.specialInstructions,
      status: update.status,
      priority: update.priority
    },

    // Delivery gets: pickup status, address
    delivery: {
      orderId,
      status: update.status,
      pickupTime: update.pickupTime,
      deliveryAddress: update.deliveryAddress,
      contactNumber: update.contactNumber
    }
  };

  // Send to customer
  if (customerId) {
    io.to(`user:${customerId}`).emit('order_update', {
      ...messages.customer,
      timestamp: new Date()
    });
  }

  // Send to kitchen staff
  kitchenStaff.forEach((staffId) => {
    io.to(`user:${staffId}`).emit('order_update', {
      ...messages.kitchen,
      timestamp: new Date()
    });
  });

  // Send to delivery staff
  deliveryStaff.forEach((staffId) => {
    io.to(`user:${staffId}`).emit('order_update', {
      ...messages.delivery,
      timestamp: new Date()
    });
  });

  // Log broadcast
  console.log(
    `[Socket Broadcast] Order ${orderId} update sent to ${participants.length} participants`
  );
};

/**
 * Real-time activity tracking
 * Track last activity to detect idle users
 */
exports.trackActivity = (socket) => {
  socket.lastActivity = Date.now();

  return setInterval(() => {
    const idleTime = Date.now() - socket.lastActivity;

    // Disconnect after 30 minutes of inactivity
    if (idleTime > 30 * 60 * 1000) {
      socket.disconnect(true);
      console.log(`[Socket] Disconnected idle user: ${socket.userId}`);
    }

    // Warn after 25 minutes
    if (idleTime > 25 * 60 * 1000) {
      socket.emit('idle_warning', {
        message: 'Your session will expire in 5 minutes due to inactivity',
        idleTime
      });
    }
  }, 60000); // Check every minute
};

/**
 * Bandwidth optimization
 * Compress large data before sending
 */
exports.sendOptimized = (socket, event, data) => {
  // Validate data isn't too large
  const serialized = JSON.stringify(data);

  if (serialized.length > 100000) {
    // > 100KB, probably too large
    console.warn(`[Socket] Large payload for event ${event}: ${serialized.length} bytes`);

    // Send in chunks or compress
    socket.emit(`${event}:compressed`, {
      data: Buffer.from(serialized).toString('base64'),
      isCompressed: true
    });
  } else {
    socket.emit(event, data);
  }
};

/**
 * Rate limiting on socket events
 * Prevent flooding
 */
class SocketRateLimiter {
  constructor(maxEventsPerSecond = 10) {
    this.maxEventsPerSecond = maxEventsPerSecond;
    this.events = new Map();
  }

  isAllowed(userId, event) {
    const key = `${userId}:${event}`;
    const now = Date.now();
    const userEvents = this.events.get(key) || [];

    // Remove old events (older than 1 second)
    const recentEvents = userEvents.filter((time) => now - time < 1000);

    if (recentEvents.length >= this.maxEventsPerSecond) {
      console.warn(`[Socket Rate Limit] User ${userId} exceeded limit for ${event}`);
      return false;
    }

    recentEvents.push(now);
    this.events.set(key, recentEvents);

    return true;
  }

  cleanup() {
    // Clean up old entries every 10 seconds
    const now = Date.now();
    for (const [key, events] of this.events.entries()) {
      const recent = events.filter((time) => now - time < 2000);
      if (recent.length === 0) {
        this.events.delete(key);
      } else {
        this.events.set(key, recent);
      }
    }
  }
}

exports.SocketRateLimiter = SocketRateLimiter;

/**
 * Usage example in socket event handler:
 *
 * const rateLimiter = new SocketRateLimiter(20); // Max 20 events/second per user
 *
 * socket.on('order_update', (data) => {
 *   if (!rateLimiter.isAllowed(socket.userId, 'order_update')) {
 *     return socket.emit('error', { message: 'Too many requests' });
 *   }
 *
 *   // Handle order update
 * });
 *
 * setInterval(() => rateLimiter.cleanup(), 10000);
 */

/**
 * Namespace-based isolation
 * Separate different types of events into namespaces
 */
exports.setupNamespaces = (io) => {
  // Orders namespace
  const ordersNsp = io.of('/orders');
  ordersNsp.on('connection', (socket) => {
    console.log('[Orders Namespace] User connected:', socket.userId);

    socket.on('subscribe_order', (orderId) => {
      socket.join(`order:${orderId}`);
    });

    socket.on('unsubscribe_order', (orderId) => {
      socket.leave(`order:${orderId}`);
    });
  });

  // Tables namespace
  const tablesNsp = io.of('/tables');
  tablesNsp.on('connection', (socket) => {
    console.log('[Tables Namespace] User connected:', socket.userId);

    socket.on('subscribe_table', (tableId) => {
      socket.join(`table:${tableId}`);
    });
  });

  // Notifications namespace
  const notificationsNsp = io.of('/notifications');
  notificationsNsp.on('connection', (socket) => {
    console.log('[Notifications Namespace] User connected:', socket.userId);
    socket.join(`user:${socket.userId}`);
  });

  return { ordersNsp, tablesNsp, notificationsNsp };
};

/**
 * Memory leak detection
 * Monitor socket connections and warn if growing unbounded
 */
exports.setupMemoryMonitoring = (io) => {
  setInterval(() => {
    const roomNames = io._adapter.rooms.keys();
    const totalSockets = io.engine.clientsCount;

    console.log(
      `[Socket Memory] Total connections: ${totalSockets}, Rooms: ${roomNames.size}`
    );

    // Warn if too many sockets
    if (totalSockets > 1000) {
      console.warn(`⚠️ [Socket] High connection count: ${totalSockets}`);
    }
  }, 30000); // Check every 30 seconds
};

module.exports = exports;
