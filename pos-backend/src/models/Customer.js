const mongoose = require('mongoose');

const visitHistorySchema = new mongoose.Schema({
  referenceId: {
    type: mongoose.Schema.Types.ObjectId
  },
  visitType: {
    type: String,
    enum: ['ORDER', 'RESERVATION', 'WALK_IN', 'DELIVERY'],
    default: 'ORDER'
  },
  amount: {
    type: Number,
    default: 0
  },
  notes: String,
  occurredAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const loyaltyTransactionSchema = new mongoose.Schema({
  points: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ['EARN', 'REDEEM', 'ADJUST'],
    required: true
  },
  reason: String,
  referenceId: {
    type: mongoose.Schema.Types.ObjectId
  },
  balanceAfter: Number,
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const walletTransactionSchema = new mongoose.Schema({
  amount: Number, // +ve for deposit, -ve for spend
  type: { type: String, enum: ['DEPOSIT', 'SPEND', 'REFUND'], required: true },
  description: String,
  referenceId: mongoose.Schema.Types.ObjectId, // Bill ID or transaction ID
  balanceAfter: Number,
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const customerSchema = new mongoose.Schema({
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true
  },
  tags: [{ type: String, trim: true }],
  notes: String,
  loyaltyPoints: {
    type: Number,
    default: 0
  },
  walletBalance: {
    type: Number,
    default: 0
  },
  walletTransactions: {
    type: [walletTransactionSchema],
    default: []
  },
  loyaltyTier: {
    type: String,
    enum: ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'],
    default: 'BRONZE'
  },
  lifetimeValue: {
    type: Number,
    default: 0
  },
  visitCount: {
    type: Number,
    default: 0
  },
  lastVisitAt: Date,
  lastOrderValue: Number,
  birthday: Date,
  anniversary: Date,
  marketingOptIn: {
    type: Boolean,
    default: true
  },
  visitHistory: {
    type: [visitHistorySchema],
    default: []
  },
  loyaltyHistory: {
    type: [loyaltyTransactionSchema],
    default: []
  },
  favoriteItems: {
    type: [{
      itemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MenuItem'
      },
      count: Number
    }],
    default: []
  },
  totalReservations: {
    type: Number,
    default: 0
  },
  totalCancelledReservations: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

customerSchema.index({ restaurantId: 1, phone: 1 }, { unique: true, sparse: true });
customerSchema.index({ restaurantId: 1, email: 1 }, { unique: true, sparse: true });
customerSchema.index({ restaurantId: 1, name: 1 });

module.exports = mongoose.model('Customer', customerSchema);
