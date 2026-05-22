const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  contactName: {
    type: String,
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
  address: {
    street: String,
    city: String,
    state: String,
    postalCode: String
  },
  gstNumber: {
    type: String,
    uppercase: true
  },
  leadTimeDays: {
    type: Number,
    default: 2
  },
  paymentTerms: {
    type: String,
    default: 'COD'
  },
  notes: String,
  tags: {
    type: [String],
    default: []
  },
  isPreferred: {
    type: Boolean,
    default: false
  },
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  lastOrderDate: Date,
  totalSpend: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

vendorSchema.index({ restaurantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Vendor', vendorSchema);
