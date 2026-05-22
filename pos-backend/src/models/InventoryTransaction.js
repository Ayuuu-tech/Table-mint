const mongoose = require('mongoose');

const inventoryTransactionSchema = new mongoose.Schema({
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  ingredientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ingredient',
    required: true
  },
  type: {
    type: String,
    enum: ['PURCHASE', 'CONSUMPTION', 'WASTAGE', 'ADJUSTMENT', 'TRANSFER'],
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  unitCost: {
    type: Number,
    default: 0
  },
  amount: {
    type: Number,
    default: 0
  },
  referenceModel: String,
  referenceId: {
    type: mongoose.Schema.Types.ObjectId
  },
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

inventoryTransactionSchema.index({ restaurantId: 1, ingredientId: 1, createdAt: -1 });

module.exports = mongoose.model('InventoryTransaction', inventoryTransactionSchema);
