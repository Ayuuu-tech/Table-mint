const mongoose = require('mongoose');

const restaurantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Restaurant name is required'],
    trim: true
  },
  ownerName: {
    type: String,
    required: [true, 'Owner name is required']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: [true, 'Phone is required']
  },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String
  },
  gstNumber: {
    type: String,
    trim: true
  },
  gstRegistered: {
    type: Boolean,
    default: false
  },
  invoiceSequence: {
    prefix: { type: String, default: 'INV' },
    currentNumber: { type: Number, default: 1 },
    separator: { type: String, default: '-' }
  },
  paymentSettings: {
    upiId: { type: String },
    bankName: { type: String },
    accountNumber: { type: String },
    ifscCode: { type: String },
    accountHolderName: { type: String }
  },
  logo: {
    type: String
  },
  subscriptionStatus: {
    type: String,
    enum: ['TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED'],
    default: 'TRIAL'
  },
  subscriptionExpiry: {
    type: Date
  },
  settings: {
    currency: {
      type: String,
      default: '₹'
    },
    taxPercentage: {
      type: Number,
      default: 5
    },
    enableTax: {
      type: Boolean,
      default: false
    },
    enableKOT: {
      type: Boolean,
      default: true
    },
    enableHappyHour: {
      type: Boolean,
      default: false
    },
    happyHourSettings: {
      start: String,
      end: String,
      discountPercentage: Number,
      days: [String]
    },
    tablePrefix: {
      type: String,
      default: 'T'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Restaurant', restaurantSchema);
