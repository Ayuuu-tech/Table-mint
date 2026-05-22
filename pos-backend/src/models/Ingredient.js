const mongoose = require('mongoose');

const ingredientSchema = new mongoose.Schema({
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
  sku: {
    type: String,
    uppercase: true,
    trim: true
  },
  category: {
    type: String,
    default: 'GENERAL'
  },
  unit: {
    type: String,
    enum: ['KG', 'GRAM', 'LITER', 'ML', 'PIECE', 'PACK', 'CUSTOM'],
    default: 'PIECE'
  },
  currentStock: {
    type: Number,
    default: 0,
    min: 0
  },
  reorderPoint: {
    type: Number,
    default: 0,
    min: 0
  },
  parLevel: {
    type: Number,
    default: 0,
    min: 0
  },
  unitCost: {
    type: Number,
    default: 0,
    min: 0
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor'
  },
  shelfLifeDays: {
    type: Number,
    default: 0
  },
  lowStock: {
    type: Boolean,
    default: false
  },
  tags: {
    type: [String],
    default: []
  },
  notes: String,
  lastRestockedAt: Date,
  lastPurchasePrice: {
    type: Number,
    default: 0
  },
  wastageQuantity: {
    type: Number,
    default: 0
  },
  wastageValue: {
    type: Number,
    default: 0
  },
  consumptionQuantity: {
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

ingredientSchema.methods.recalculateLowStock = function() {
  this.lowStock = this.reorderPoint > 0 && this.currentStock <= this.reorderPoint;
};

ingredientSchema.pre('save', function(next) {
  this.recalculateLowStock();
  next();
});

ingredientSchema.index({ restaurantId: 1, name: 1 }, { unique: true });
ingredientSchema.index({ restaurantId: 1, lowStock: 1 });

module.exports = mongoose.model('Ingredient', ingredientSchema);
