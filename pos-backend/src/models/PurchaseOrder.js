const mongoose = require('mongoose');

const purchaseOrderItemSchema = new mongoose.Schema({
  ingredientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ingredient',
    required: true
  },
  name: String,
  unit: String,
  quantityOrdered: {
    type: Number,
    required: true
  },
  quantityReceived: {
    type: Number,
    default: 0
  },
  unitCost: {
    type: Number,
    default: 0
  },
  amount: {
    type: Number,
    default: 0
  }
}, { _id: false });

const purchaseOrderSchema = new mongoose.Schema({
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  orderNumber: {
    type: String,
    unique: true
  },
  status: {
    type: String,
    enum: ['DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED'],
    default: 'DRAFT'
  },
  items: {
    type: [purchaseOrderItemSchema],
    default: []
  },
  expectedDate: Date,
  orderedAt: Date,
  receivedAt: Date,
  notes: String,
  subtotal: {
    type: Number,
    default: 0
  },
  taxes: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

purchaseOrderSchema.pre('validate', async function(next) {
  if (this.orderNumber) return next();
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  let counter = 1;
  while (counter < 9999) {
    const candidate = `PO-${dateStr}-${String(counter).padStart(4, '0')}`;
    const exists = await mongoose.model('PurchaseOrder').findOne({ orderNumber: candidate });
    if (!exists) {
      this.orderNumber = candidate;
      return next();
    }
    counter += 1;
  }
  this.orderNumber = `PO-${dateStr}-${Date.now().toString().slice(-4)}`;
  next();
});

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
