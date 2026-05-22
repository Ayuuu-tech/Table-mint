const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: ['PERCENTAGE', 'FIXED'],
    required: true
  },
  value: {
    type: Number,
    required: true,
    min: 0
  },
  minOrderAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  maxDiscount: {
    type: Number,
    min: 0
  },
  validFrom: {
    type: Date,
    default: Date.now
  },
  validUntil: {
    type: Date,
    required: true
  },
  usageLimit: {
    type: Number,
    min: 1
  },
  usedCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  applicableOn: {
    type: [String],
    enum: ['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'ALL'],
    default: ['ALL']
  }
}, {
  timestamps: true
});

// Index for faster lookups
couponSchema.index({ restaurant: 1, code: 1 }, { unique: true });
couponSchema.index({ validUntil: 1 });

module.exports = mongoose.model('Coupon', couponSchema);
