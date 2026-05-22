const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  billNumber: {
    type: String,
    required: true,
    unique: true
  },
  tableNumber: {
    type: String,
    required: true
  },
  items: [{
    name: String,
    quantity: Number,
    price: Number,
    itemTotal: Number,
    variant: { name: String, price: Number },
    modifiers: [{ groupName: String, name: String, price: Number }],
    hsnCode: String,
    taxRate: Number,
    taxAmount: Number
  }],
  subtotal: {
    type: Number,
    required: true
  },
  tax: {
    type: Number,
    default: 0
  },
  // Detailed Tax Breakdown for GST Reports (Feature 6)
  taxBreakdown: {
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    cess: { type: Number, default: 0 }
  },
  financialYear: {
    type: String // e.g., '2025-26'
  },
  taxPercentage: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  couponCode: {
    type: String,
    uppercase: true
  },
  couponId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon'
  },
  totalAmount: {
    type: Number,
    required: true
  },
  paymentMode: {
    type: String,
    enum: ['CASH', 'CARD', 'UPI', 'WALLET', 'SPLIT', 'PARTIAL', 'OTHER', 'ONLINE'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['PAID', 'PENDING', 'PARTIAL', 'REFUNDED'],
    default: 'PAID'
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  customerName: {
    type: String
  },
  customerPhone: {
    type: String
  },
  customerEmail: {
    type: String
  },
  loyaltyPointsEarned: {
    type: Number,
    default: 0
  },
  loyaltyPointsRedeemed: {
    type: Number,
    default: 0
  },
  customerLifetimeValueSnapshot: {
    type: Number,
    default: 0
  },
  notes: {
    type: String
  },
  isSplit: {
    type: Boolean,
    default: false
  },
  paidAmount: {
    type: Number,
    default: 0
  },
  partials: [{
    amount: Number,
    paymentMode: { type: String, enum: ['CASH', 'CARD', 'UPI', 'WALLET', 'OTHER'] },
    paidAt: { type: Date, default: Date.now },
    reference: String
  }],
  splitDetails: [{
    customerName: String,
    amount: Number,
    paymentMode: {
      type: String,
      enum: ['CASH', 'CARD', 'UPI', 'WALLET', 'OTHER']
    },
    paid: {
      type: Boolean,
      default: false
    }
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Auto-generate bill number for GST Compliance (Sequential per FY)
billSchema.pre('validate', async function(next) {
  if (this.billNumber) return next();

  try {
    const date = new Date();
    const month = date.getMonth() + 1; // 1-12
    const year = date.getFullYear();
    
    // Determine Financial Year
    // If Month is Jan(1), Feb(2), Mar(3), FY is (Year-1)-Year (e.g., 2025-26 for Jan 2026)
    // Else FY is Year-(Year+1)
    let startYear = (month <= 3) ? year - 1 : year;
    let endYear = startYear + 1;
    const fyShort = `${startYear.toString().slice(-2)}${endYear.toString().slice(-2)}`; // e.g., 2526
    const fyString = `${startYear}-${endYear.toString().slice(-2)}`; // e.g., 2025-26
    
    this.financialYear = fyString;

    // Find last bill of this specific restaurant for this FY
    const lastBill = await mongoose.model('Bill')
      .findOne({ 
        restaurantId: this.restaurantId,
        financialYear: fyString 
      })
      .sort({ createdAt: -1 }) // Get latest
      .select('billNumber');

    let nextSequence = 1;
    if (lastBill && lastBill.billNumber) {
      // Expected format: INV-YY-XXXX or similar
      const parts = lastBill.billNumber.split('-');
      const lastSeq = parseInt(parts[parts.length - 1]);
      if (!isNaN(lastSeq)) {
        nextSequence = lastSeq + 1;
      }
    }

    // Format: INV-FY-SEQUENCE (e.g., INV-2526-0001)
    // 16 chars max usually preferred. INV-2526-0001 is 13 chars.
    this.billNumber = `INV-${fyShort}-${String(nextSequence).padStart(4, '0')}`;
    
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('Bill', billSchema);
