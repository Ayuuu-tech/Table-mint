const Customer = require('../models/Customer');

const VISIT_HISTORY_LIMIT = 50;
const LOYALTY_HISTORY_LIMIT = 50;

const resolveCustomerQuery = ({ restaurantId, customerId, phone, email }) => {
  if (customerId) {
    return { _id: customerId, restaurantId };
  }
  const or = [];
  if (phone) {
    // Exact match
    or.push({ phone });

    // Clean phone (digits only)
    const cleanPhone = phone.replace(/\D/g, '');

    // If we have at least 10 digits, try to match last 10
    if (cleanPhone.length >= 10) {
      const last10 = cleanPhone.slice(-10);
      // Try finding by last 10 digits (flexible matching if stored variably)
      if (last10 !== phone) or.push({ phone: last10 });
      if (`+91${last10}` !== phone) or.push({ phone: `+91${last10}` });
      if (`0${last10}` !== phone) or.push({ phone: `0${last10}` });
    }
  }
  if (email) {
    or.push({ email });
  }
  if (!or.length) return null;
  return { restaurantId, $or: or };
};

exports.findOrCreateCustomer = async ({
  restaurantId,
  customerId,
  name,
  phone,
  email,
  birthday,
  anniversary,
  notes,
  createdBy
}) => {
  const query = resolveCustomerQuery({ restaurantId, customerId, phone, email });

  let customer = query ? await Customer.findOne(query) : null;

  if (!customer) {
    customer = await Customer.create({
      restaurantId,
      name,
      phone,
      email,
      birthday,
      anniversary,
      notes,
      createdBy
    });
    return customer;
  }

  const updates = {};
  if (name && name !== customer.name) updates.name = name;
  if (phone && phone !== customer.phone) updates.phone = phone;
  if (email && email !== customer.email) updates.email = email;
  if (birthday && !customer.birthday) updates.birthday = birthday;
  if (anniversary && !customer.anniversary) updates.anniversary = anniversary;
  if (notes) updates.notes = notes;

  if (Object.keys(updates).length) {
    customer = await Customer.findByIdAndUpdate(customer._id, updates, { new: true });
  }

  return customer;
};

exports.recordVisit = async ({ customerId, referenceId, visitType = 'ORDER', amount = 0, notes }) => {
  if (!customerId) return null;

  const update = {
    $inc: {
      lifetimeValue: amount,
      visitCount: 1
    },
    $set: {
      lastVisitAt: new Date(),
      lastOrderValue: amount
    },
    $push: {
      visitHistory: {
        $each: [{ referenceId, visitType, amount, notes, occurredAt: new Date() }],
        $position: 0,
        $slice: VISIT_HISTORY_LIMIT
      }
    }
  };

  return Customer.findByIdAndUpdate(customerId, update, { new: true });
};

exports.recordReservationStats = async ({ customerId, incrementTotal = 0, incrementCancelled = 0 }) => {
  if (!customerId) return null;

  const inc = {};
  if (incrementTotal) {
    inc.totalReservations = incrementTotal;
  }
  if (incrementCancelled) {
    inc.totalCancelledReservations = incrementCancelled;
  }

  if (!Object.keys(inc).length) {
    return null;
  }

  return Customer.findByIdAndUpdate(customerId, { $inc: inc }, { new: true });
};

exports.adjustLoyaltyPoints = async ({ customerId, points, type = 'EARN', reason, referenceId }) => {
  if (!customerId || !points) return null;

  const customer = await Customer.findById(customerId);
  if (!customer) return null;

  let newBalance = customer.loyaltyPoints;
  if (type === 'REDEEM') {
    if (customer.loyaltyPoints < points) {
      throw new Error('Insufficient loyalty points');
    }
    newBalance -= points;
  } else {
    newBalance += points;
  }

  return Customer.findByIdAndUpdate(customerId, {
    loyaltyPoints: newBalance,
    $push: {
      loyaltyHistory: {
        $each: [{ points: type === 'REDEEM' ? -points : points, type, reason, referenceId, balanceAfter: newBalance, createdAt: new Date() }],
        $position: 0,
        $slice: LOYALTY_HISTORY_LIMIT
      }
    }
  }, { new: true });
};

exports.enrichWithLoyaltyTier = (customer) => {
  if (!customer) return customer;

  const lifetime = customer.lifetimeValue || 0;
  let tier = 'BRONZE';
  if (lifetime > 50000) {
    tier = 'PLATINUM';
  } else if (lifetime > 25000) {
    tier = 'GOLD';
  } else if (lifetime > 10000) {
    tier = 'SILVER';
  }

  if (customer.loyaltyTier !== tier) {
    customer.loyaltyTier = tier;
  }

  return customer;
};
