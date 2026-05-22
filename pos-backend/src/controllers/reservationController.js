const Reservation = require('../models/Reservation');
const Table = require('../models/Table');
const asyncHandler = require('express-async-handler');
const { findOrCreateCustomer, recordReservationStats } = require('../services/customerService');

// @desc    Create new reservation
// @route   POST /api/reservations
// @access  Private
exports.createReservation = asyncHandler(async (req, res) => {
  const { 
    tableId, 
    customerId,
    customerName, 
    customerPhone, 
    customerEmail,
    birthday,
    anniversary,
    celebrationType,
    numberOfGuests, 
    reservationDate, 
    reservationTime, 
    duration,
    specialRequests 
  } = req.body;

  // Verify table exists and belongs to restaurant
  const table = await Table.findOne({ 
    _id: tableId, 
    restaurantId: req.user.restaurantId 
  });

  if (!table) {
    res.status(404);
    throw new Error('Table not found');
  }

  // Check if table capacity is sufficient
  if (numberOfGuests > table.capacity) {
    res.status(400);
    throw new Error(`Table capacity is ${table.capacity}, cannot accommodate ${numberOfGuests} guests`);
  }

  // Check for conflicting reservations
  const reservationDateTime = new Date(reservationDate);
  const [hours, minutes] = reservationTime.split(':');
  reservationDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

  const reservationDuration = duration || 120;
  const endTime = new Date(reservationDateTime.getTime() + reservationDuration * 60000);

  const conflictingReservations = await Reservation.find({
    table: tableId,
    status: { $in: ['PENDING', 'CONFIRMED', 'SEATED'] },
    reservationDate: {
      $gte: new Date(reservationDateTime.getTime() - reservationDuration * 60000),
      $lte: endTime
    }
  });

  if (conflictingReservations.length > 0) {
    res.status(400);
    throw new Error('Table is already reserved for this time slot');
  }

  let customerRecord = null;
  if (customerId || customerPhone || customerEmail || customerName) {
    customerRecord = await findOrCreateCustomer({
      restaurantId: req.user.restaurantId,
      customerId,
      name: customerName || 'Guest',
      phone: customerPhone,
      email: customerEmail,
      birthday,
      anniversary,
      createdBy: req.user.id
    });
  }

  const reservation = await Reservation.create({
    restaurant: req.user.restaurantId,
    table: tableId,
    customerName,
    customerPhone,
    customerEmail,
    customer: customerRecord?._id,
    celebrationType,
    numberOfGuests,
    reservationDate: reservationDateTime,
    reservationTime,
    duration: reservationDuration,
    specialRequests,
    createdBy: req.user.id
  });

  if (customerRecord) {
    await recordReservationStats({ customerId: customerRecord._id, incrementTotal: 1 });
  }

  const populatedReservation = await Reservation.findById(reservation._id)
    .populate('table', 'tableNumber capacity')
    .populate('customer', 'name phone email loyaltyPoints loyaltyTier');

  res.status(201).json(populatedReservation);
});

// @desc    Get all reservations for restaurant
// @route   GET /api/reservations
// @access  Private
exports.getReservations = asyncHandler(async (req, res) => {
  const { date, status, tableId } = req.query;
  
  let query = { restaurant: req.user.restaurantId };

  if (date) {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);
    
    query.reservationDate = {
      $gte: startDate,
      $lte: endDate
    };
  }

  if (status) {
    query.status = status;
  }

  if (tableId) {
    query.table = tableId;
  }

  const reservations = await Reservation.find(query)
    .populate('table', 'tableNumber capacity')
    .populate('customer', 'name phone email loyaltyPoints loyaltyTier')
    .sort({ reservationDate: 1, reservationTime: 1 });

  res.json(reservations);
});

// @desc    Get reservation by ID
// @route   GET /api/reservations/:id
// @access  Private
exports.getReservationById = asyncHandler(async (req, res) => {
  const reservation = await Reservation.findById(req.params.id)
    .populate('table', 'tableNumber capacity')
    .populate('createdBy', 'name email')
    .populate('customer', 'name phone email loyaltyPoints loyaltyTier');

  if (!reservation) {
    res.status(404);
    throw new Error('Reservation not found');
  }

  // Check if reservation belongs to user's restaurant
  if (reservation.restaurant.toString() !== req.user.restaurantId.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  res.json(reservation);
});

// @desc    Update reservation
// @route   PUT /api/reservations/:id
// @access  Private
exports.updateReservation = asyncHandler(async (req, res) => {
  const reservation = await Reservation.findById(req.params.id);

  if (!reservation) {
    res.status(404);
    throw new Error('Reservation not found');
  }

  // Check if reservation belongs to user's restaurant
  if (reservation.restaurant.toString() !== req.user.restaurantId.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  // If changing table or time, check for conflicts
  if (req.body.tableId || req.body.reservationDate || req.body.reservationTime) {
    const tableId = req.body.tableId || reservation.table;
    const reservationDate = req.body.reservationDate || reservation.reservationDate;
    const reservationTime = req.body.reservationTime || reservation.reservationTime;
    const duration = req.body.duration || reservation.duration;

    const reservationDateTime = new Date(reservationDate);
    const [hours, minutes] = reservationTime.split(':');
    reservationDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    const endTime = new Date(reservationDateTime.getTime() + duration * 60000);

    const conflictingReservations = await Reservation.find({
      _id: { $ne: req.params.id },
      table: tableId,
      status: { $in: ['PENDING', 'CONFIRMED', 'SEATED'] },
      reservationDate: {
        $gte: new Date(reservationDateTime.getTime() - duration * 60000),
        $lte: endTime
      }
    });

    if (conflictingReservations.length > 0) {
      res.status(400);
      throw new Error('Table is already reserved for this time slot');
    }
  }

  const updatedReservation = await Reservation.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  ).populate('table', 'tableNumber capacity')
   .populate('customer', 'name phone email loyaltyPoints loyaltyTier');

  res.json(updatedReservation);
});

// @desc    Update reservation status
// @route   PATCH /api/reservations/:id/status
// @access  Private
exports.updateReservationStatus = asyncHandler(async (req, res) => {
  const { status, cancellationReason } = req.body;

  const reservation = await Reservation.findById(req.params.id);

  if (!reservation) {
    res.status(404);
    throw new Error('Reservation not found');
  }

  // Check if reservation belongs to user's restaurant
  if (reservation.restaurant.toString() !== req.user.restaurantId.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  reservation.status = status;

  if (status === 'CONFIRMED') {
    reservation.confirmedAt = new Date();
  } else if (status === 'CANCELLED') {
    reservation.cancelledAt = new Date();
    if (cancellationReason) {
      reservation.cancellationReason = cancellationReason;
    }
    if (reservation.customer) {
      await recordReservationStats({ customerId: reservation.customer, incrementCancelled: 1 });
    }
  }

  await reservation.save();

  const populatedReservation = await Reservation.findById(reservation._id)
    .populate('table', 'tableNumber capacity')
    .populate('customer', 'name phone email loyaltyPoints loyaltyTier');

  res.json(populatedReservation);
});

// @desc    Delete reservation
// @route   DELETE /api/reservations/:id
// @access  Private
exports.deleteReservation = asyncHandler(async (req, res) => {
  const reservation = await Reservation.findById(req.params.id);

  if (!reservation) {
    res.status(404);
    throw new Error('Reservation not found');
  }

  // Check if reservation belongs to user's restaurant
  if (reservation.restaurant.toString() !== req.user.restaurantId.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  await reservation.deleteOne();
  res.json({ message: 'Reservation deleted' });
});

// @desc    Get upcoming reservations
// @route   GET /api/reservations/upcoming
// @access  Private
exports.getUpcomingReservations = asyncHandler(async (req, res) => {
  const now = new Date();
  
  const reservations = await Reservation.find({
    restaurant: req.user.restaurantId,
    reservationDate: { $gte: now },
    status: { $in: ['PENDING', 'CONFIRMED'] }
  })
    .populate('table', 'tableNumber capacity')
    .populate('customer', 'name phone email loyaltyTier')
    .sort({ reservationDate: 1, reservationTime: 1 })
    .limit(10);

  res.json(reservations);
});
