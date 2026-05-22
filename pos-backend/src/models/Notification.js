const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  type: {
    type: String,
    enum: [
      'LOW_STOCK',
      'SUBSCRIPTION_EXPIRY',
      'NEW_ORDER',
      'LARGE_ORDER',
      'FAILED_PAYMENT',
      'ORDER_READY',
      'RESERVATION_REMINDER',
      'SYSTEM'
    ],
    required: true
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
    default: 'MEDIUM'
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed, // Additional context data
    default: {}
  },
  read: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  sentVia: {
    type: [String],
    enum: ['IN_APP', 'EMAIL', 'SMS', 'PUSH'],
    default: ['IN_APP']
  },
  emailSent: {
    type: Boolean,
    default: false
  },
  smsSent: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
notificationSchema.index({ restaurantId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ restaurantId: 1, userId: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // Auto-delete after 30 days

module.exports = mongoose.model('Notification', notificationSchema);
