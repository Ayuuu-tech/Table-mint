const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  table: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Table',
    required: true
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  customerPhone: {
    type: String,
    required: true,
    trim: true
  },
  customerEmail: {
    type: String,
    trim: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  celebrationType: {
    type: String,
    enum: ['BIRTHDAY', 'ANNIVERSARY', 'OTHER']
  },
  numberOfGuests: {
    type: Number,
    required: true,
    min: 1
  },
  reservationDate: {
    type: Date,
    required: true
  },
  reservationTime: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    default: 120, // minutes
    min: 30
  },
  status: {
    type: String,
    enum: ['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
    default: 'PENDING'
  },
  specialRequests: {
    type: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  confirmedAt: {
    type: Date
  },
  cancelledAt: {
    type: Date
  },
  cancellationReason: {
    type: String
  }
}, {
  timestamps: true
});

// Index for faster queries
reservationSchema.index({ restaurant: 1, reservationDate: 1 });
reservationSchema.index({ table: 1, reservationDate: 1 });
reservationSchema.index({ status: 1 });

module.exports = mongoose.model('Reservation', reservationSchema);
