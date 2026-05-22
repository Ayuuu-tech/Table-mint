const Coupon = require('../models/Coupon');
const asyncHandler = require('express-async-handler');

// @desc    Create new coupon
// @route   POST /api/coupons
// @access  Private
exports.createCoupon = asyncHandler(async (req, res) => {
  const { code, description, type, value, minOrderAmount, maxDiscount, validUntil, usageLimit, applicableOn } = req.body;

  // Check if coupon code already exists
  const existingCoupon = await Coupon.findOne({
    restaurant: req.user.restaurantId,
    code: code.toUpperCase()
  });

  if (existingCoupon) {
    res.status(400);
    throw new Error('Coupon code already exists');
  }

  const coupon = await Coupon.create({
    restaurant: req.user.restaurantId,
    code: code.toUpperCase(),
    description,
    type,
    value,
    minOrderAmount,
    maxDiscount,
    validUntil,
    usageLimit,
    applicableOn: applicableOn || ['ALL']
  });

  res.status(201).json(coupon);
});

// @desc    Get all coupons for restaurant
// @route   GET /api/coupons
// @access  Private
exports.getCoupons = asyncHandler(async (req, res) => {
  const coupons = await Coupon.find({ restaurant: req.user.restaurantId })
    .sort({ createdAt: -1 });

  res.json(coupons);
});

// @desc    Validate and get coupon details
// @route   GET /api/coupons/validate/:code
// @access  Private
exports.validateCoupon = asyncHandler(async (req, res) => {
  const { code } = req.params;
  const { orderAmount, orderType } = req.query;

  const coupon = await Coupon.findOne({
    restaurant: req.user.restaurantId,
    code: code.toUpperCase(),
    isActive: true
  });

  if (!coupon) {
    res.status(404);
    throw new Error('Coupon not found or inactive');
  }

  // Check if coupon is expired
  if (new Date() > coupon.validUntil) {
    res.status(400);
    throw new Error('Coupon has expired');
  }

  // Check if coupon has not started yet
  if (new Date() < coupon.validFrom) {
    res.status(400);
    throw new Error('Coupon is not yet valid');
  }

  // Check usage limit
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    res.status(400);
    throw new Error('Coupon usage limit reached');
  }

  // Check minimum order amount
  if (orderAmount && parseFloat(orderAmount) < coupon.minOrderAmount) {
    res.status(400);
    throw new Error(`Minimum order amount of ₹${coupon.minOrderAmount} required`);
  }

  // Check if applicable on order type
  if (orderType && !coupon.applicableOn.includes('ALL') && !coupon.applicableOn.includes(orderType)) {
    res.status(400);
    throw new Error(`Coupon not applicable on ${orderType} orders`);
  }

  // Calculate discount
  let discountAmount = 0;
  if (orderAmount) {
    if (coupon.type === 'PERCENTAGE') {
      discountAmount = (parseFloat(orderAmount) * coupon.value) / 100;
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    } else {
      discountAmount = coupon.value;
    }
  }

  res.json({
    coupon,
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    isValid: true
  });
});

// @desc    Update coupon
// @route   PUT /api/coupons/:id
// @access  Private
exports.updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);

  if (!coupon) {
    res.status(404);
    throw new Error('Coupon not found');
  }

  // Check if coupon belongs to user's restaurant
  if (coupon.restaurant.toString() !== req.user.restaurantId.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  const updatedCoupon = await Coupon.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  res.json(updatedCoupon);
});

// @desc    Delete coupon
// @route   DELETE /api/coupons/:id
// @access  Private
exports.deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);

  if (!coupon) {
    res.status(404);
    throw new Error('Coupon not found');
  }

  // Check if coupon belongs to user's restaurant
  if (coupon.restaurant.toString() !== req.user.restaurantId.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  await coupon.deleteOne();
  res.json({ message: 'Coupon deleted' });
});

// @desc    Apply coupon to bill (increment usage)
// @route   POST /api/coupons/:id/apply
// @access  Private
exports.applyCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);

  if (!coupon) {
    res.status(404);
    throw new Error('Coupon not found');
  }

  // Check if coupon belongs to user's restaurant
  if (coupon.restaurant.toString() !== req.user.restaurantId.toString()) {
    res.status(403);
    throw new Error('Not authorized');
  }

  // Increment usage count
  coupon.usedCount += 1;
  await coupon.save();

  res.json(coupon);
});
