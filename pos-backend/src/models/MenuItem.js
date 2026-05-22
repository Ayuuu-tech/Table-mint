const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Item name is required'],
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['STARTERS', 'MAIN_COURSE', 'BREADS', 'RICE', 'BEVERAGES', 'DESSERTS', 'CHINESE', 'SOUTH_INDIAN', 'OTHER'],
    default: 'OTHER'
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: 0
  },
  description: {
    type: String,
    trim: true
  },
  image: {
    type: String
  },
  recipe: {
    type: [{
      ingredient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ingredient'
      },
      quantity: {
        type: Number,
        default: 0
      },
      unit: {
        type: String,
        default: 'UNIT'
      }
    }],
    default: []
  },
  foodCost: {
    type: Number,
    default: 0
  },
  isVeg: {
    type: Boolean,
    default: true
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  preparationTime: {
    type: Number,
    default: 15 // minutes
  },
  // New Fields for Tax & Compliance (Feature 6)
  hsnCode: {
    type: String,
    trim: true
  },
  taxRate: {
    type: Number,
    enum: [0, 5, 12, 18, 28], // Standard GST slabs
    default: 5
  },
  // New Fields for Advanced POS (Feature 8)
  hasVariants: {
    type: Boolean,
    default: false
  },
  variants: [{
    name: String, // e.g. "Small", "Large"
    price: Number,
    isAvailable: { type: Boolean, default: true }
  }],
  modifierGroups: [{
    name: String, // e.g. "Add-ons", "Crust"
    minSelection: { type: Number, default: 0 },
    maxSelection: { type: Number, default: 1 },
    required: { type: Boolean, default: false },
    options: [{
      name: String,
      price: Number, // Additional price
      isAvailable: { type: Boolean, default: true }
    }]
  }],
  isHappyHourEligible: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
menuItemSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('MenuItem', menuItemSchema);
