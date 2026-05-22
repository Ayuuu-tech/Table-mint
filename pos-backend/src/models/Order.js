const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  menuItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MenuItem',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true
  },
  itemTotal: {
    type: Number,
    required: true
  },
  // New Fields for Feature 8 (Variants/Modifiers)
  selectedVariant: {
    name: String,
    price: Number
  },
  selectedModifiers: [{
    groupName: String,
    name: String,
    price: Number
  }],
  specialInstructions: {
    type: String,
    trim: true
  },
  notes: {
    type: String
  },
  kitchenStatus: {
    type: String,
    enum: ['PENDING', 'PREPARING', 'READY', 'SERVED'],
    default: 'PENDING'
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  prepTime: {
    type: Number, // minutes
    default: 0
  },
  // Feature 6: Item-wise Tax
  taxRate: {
    type: Number,
    default: 0
  },
  hsnCode: {
    type: String
  }
});

const orderSchema = new mongoose.Schema({
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  customerName: String,
  customerPhone: String,
  customerEmail: String,
  tableId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Table',
    required: false
  },
  tableNumber: {
    type: String,
    required: true
  },
  items: [orderItemSchema],
  subtotal: {
    type: Number,
    required: true,
    default: 0
  },
  tax: {
    type: Number,
    default: 0
  },
  taxPercentage: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  loyaltyPointsApplied: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    default: 0
  },
  status: {
    type: String,
    enum: ['OPEN', 'PAID', 'CANCELLED'],
    default: 'OPEN'
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PAID', 'FAILED'],
    default: 'PENDING'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  closedAt: {
    type: Date
  }
});

// Calculate totals before saving
orderSchema.pre('save', function(next) {
  this.subtotal = this.items.reduce((sum, item) => sum + item.itemTotal, 0);
  
  // Feature 6: Calculate tax based on item-level tax rates
  this.tax = this.items.reduce((sum, item) => {
    const itemTax = (item.itemTotal * (item.taxRate || 0)) / 100;
    return sum + itemTax;
  }, 0);

  // Fallback to global taxPercentage if no item taxes found (backward compatibility)
  if (this.tax === 0 && this.taxPercentage > 0 && this.subtotal > 0) {
    // Check if truly no items have tax defined (to distinguish from 0% items)
    const hasItemTaxes = this.items.some(item => item.taxRate !== undefined);
    if (!hasItemTaxes) {
      this.tax = (this.subtotal * this.taxPercentage) / 100;
    }
  }

  this.totalAmount = this.subtotal + this.tax - this.discount;
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Order', orderSchema);
