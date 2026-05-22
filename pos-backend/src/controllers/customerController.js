const Bill = require('../models/Bill');
const Customer = require('../models/Customer');
const { Parser } = require('json2csv');
const { findOrCreateCustomer, adjustLoyaltyPoints, enrichWithLoyaltyTier } = require('../services/customerService');

// @desc    List customers with filters/search
// @route   GET /api/customers
// @access  Private
exports.getCustomers = async (req, res) => {
  try {
    const { search, tier, minVisits } = req.query;
    const filter = { restaurantId: req.user.restaurantId };

    if (tier) {
      filter.loyaltyTier = tier;
    }

    if (minVisits) {
      filter.visitCount = { $gte: Number(minVisits) };
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [
        { name: regex },
        { phone: regex },
        { email: regex }
      ];
    }

    const customers = await Customer.find(filter)
      .sort({ updatedAt: -1 })
      .limit(100);

    res.json({
      success: true,
      count: customers.length,
      data: customers.map(enrichWithLoyaltyTier)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Unable to fetch customers' });
  }
};

// @desc    Get single customer profile
// @route   GET /api/customers/:id
// @access  Private
exports.getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findOne({
      _id: req.params.id,
      restaurantId: req.user.restaurantId
    });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    res.json({ success: true, data: enrichWithLoyaltyTier(customer) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Unable to fetch customer' });
  }
};

// @desc    Create customer manually
// @route   POST /api/customers
// @access  Private
exports.createCustomer = async (req, res) => {
  try {
    if (!req.body.name) {
      return res.status(400).json({ success: false, message: 'Customer name is required' });
    }
    const customer = await findOrCreateCustomer({
      restaurantId: req.user.restaurantId,
      createdBy: req.user.id,
      ...req.body
    });

    res.status(201).json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Unable to create customer' });
  }
};

// @desc    Update customer profile
// @route   PUT /api/customers/:id
// @access  Private
exports.updateCustomer = async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.restaurantId;
    delete updates.loyaltyHistory;
    delete updates.visitHistory;

    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, restaurantId: req.user.restaurantId },
      updates,
      { new: true, runValidators: true }
    );

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    res.json({ success: true, data: enrichWithLoyaltyTier(customer) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Unable to update customer' });
  }
};

// @desc    Adjust loyalty points (earn/redeem)
// @route   POST /api/customers/:id/loyalty
// @access  Private
exports.updateLoyaltyPoints = async (req, res) => {
  try {
    const { points, type, reason } = req.body;
    const customer = await adjustLoyaltyPoints({
      customerId: req.params.id,
      points: Number(points),
      type: type || 'EARN',
      reason
    });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found or invalid points' });
    }

    res.json({ success: true, data: enrichWithLoyaltyTier(customer) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Unable to update loyalty points' });
  }
};

// @desc    Upcoming celebrations
// @route   GET /api/customers/highlights/upcoming
exports.getUpcomingCelebrations = async (req, res) => {
  try {
    const now = new Date();
    const next30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const customers = await Customer.find({
      restaurantId: req.user.restaurantId,
      $or: [
        { birthday: { $exists: true } },
        { anniversary: { $exists: true } }
      ]
    }).select('name phone email birthday anniversary loyaltyTier');

    const upcoming = customers.filter((customer) => {
      const matches = [];
      if (customer.birthday) {
        const birthday = new Date(customer.birthday);
        birthday.setFullYear(now.getFullYear());
        if (birthday < now) birthday.setFullYear(now.getFullYear() + 1);
        matches.push(birthday);
      }
      if (customer.anniversary) {
        const anniversary = new Date(customer.anniversary);
        anniversary.setFullYear(now.getFullYear());
        if (anniversary < now) anniversary.setFullYear(now.getFullYear() + 1);
        matches.push(anniversary);
      }
      return matches.some(date => date >= now && date <= next30);
    });

    res.json({ success: true, data: upcoming.slice(0, 50) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Unable to fetch highlights' });
  }
};

// @desc    Handle wallet transaction (Deposit/Spend)
// @route   POST /api/customers/:id/wallet
// @access  Private
exports.handleWalletTransaction = async (req, res) => {
  try {
    const { amount, type, description, referenceId } = req.body;
    
    if (!amount || !type) {
      return res.status(400).json({ success: false, message: 'Amount and type are required' });
    }

    const customer = await Customer.findOne({ 
      _id: req.params.id, 
      restaurantId: req.user.restaurantId 
    });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Calculate new balance
    let newBalance = customer.walletBalance || 0;
    
    // For DEPOSIT: Add amount
    if (type === 'DEPOSIT' || type === 'REFUND') {
        newBalance += Number(amount);
    } 
    // For SPEND: Deduct amount
    else if (type === 'SPEND') {
        if (newBalance < amount) {
            return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
        }
        newBalance -= Number(amount);
    }

    // Create transaction record
    const transaction = {
        amount: Number(amount),
        type,
        description: description || `Manual ${type}`,
        balanceAfter: newBalance,
        referenceId: referenceId || null,
        createdAt: new Date()
    };

    customer.walletBalance = newBalance;
    customer.walletTransactions.push(transaction);
    
    await customer.save();

    res.json({ success: true, data: customer, transaction });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Unable to process wallet transaction' });
  }
};

// @desc    Export customer data as CSV
// @route   GET /api/customers/export
// @access  Private (Owner only)
exports.exportCustomersCSV = async (req, res) => {
  try {
    // Get all bills with customer information
    const bills = await Bill.find({ 
      restaurantId: req.user.restaurantId,
      $or: [
        { customerName: { $exists: true, $ne: null, $ne: '' } },
        { customerPhone: { $exists: true, $ne: null, $ne: '' } }
      ]
    })
    .sort({ createdAt: -1 })
    .lean();

    // Create customer map to avoid duplicates
    const customersMap = new Map();

    bills.forEach(bill => {
      const key = bill.customerPhone || bill.customerName || bill._id;
      
      if (!customersMap.has(key)) {
        customersMap.set(key, {
          name: bill.customerName || 'N/A',
          phone: bill.customerPhone || 'N/A',
          totalOrders: 1,
          totalSpent: bill.totalAmount,
          lastVisit: bill.createdAt,
          firstVisit: bill.createdAt
        });
      } else {
        const customer = customersMap.get(key);
        customer.totalOrders += 1;
        customer.totalSpent += bill.totalAmount;
        if (new Date(bill.createdAt) > new Date(customer.lastVisit)) {
          customer.lastVisit = bill.createdAt;
        }
        if (new Date(bill.createdAt) < new Date(customer.firstVisit)) {
          customer.firstVisit = bill.createdAt;
        }
      }
    });

    // Convert map to array
    const customers = Array.from(customersMap.values()).map(customer => ({
      'Customer Name': customer.name,
      'Phone Number': customer.phone,
      'Total Orders': customer.totalOrders,
      'Total Spent': customer.totalSpent.toFixed(2),
      'Average Order Value': (customer.totalSpent / customer.totalOrders).toFixed(2),
      'First Visit': new Date(customer.firstVisit).toLocaleDateString(),
      'Last Visit': new Date(customer.lastVisit).toLocaleDateString()
    }));

    if (customers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No customer data found'
      });
    }

    // Convert to CSV
    const parser = new Parser();
    const csv = parser.parse(customers);

    // Send CSV file
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=customers-${Date.now()}.csv`);
    res.status(200).send(csv);

  } catch (error) {
    console.error('Customer export error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting customer data'
    });
  }
};

// @desc    Get customer statistics
// @route   GET /api/customers/stats
// @access  Private (Owner only)
exports.getCustomerStats = async (req, res) => {
  try {
    const bills = await Bill.find({ 
      restaurantId: req.user.restaurantId,
      $or: [
        { customerName: { $exists: true, $ne: null, $ne: '' } },
        { customerPhone: { $exists: true, $ne: null, $ne: '' } }
      ]
    }).lean();

    const customersMap = new Map();
    bills.forEach(bill => {
      const key = bill.customerPhone || bill.customerName || bill._id;
      if (!customersMap.has(key)) {
        customersMap.set(key, { orders: 1, spent: bill.totalAmount });
      } else {
        const customer = customersMap.get(key);
        customer.orders += 1;
        customer.spent += bill.totalAmount;
      }
    });

    const totalCustomers = customersMap.size;
    const totalRevenue = Array.from(customersMap.values()).reduce((sum, c) => sum + c.spent, 0);
    const avgOrderValue = totalRevenue / bills.length || 0;
    const repeatCustomers = Array.from(customersMap.values()).filter(c => c.orders > 1).length;

    res.status(200).json({
      success: true,
      data: {
        totalCustomers,
        totalRevenue: totalRevenue.toFixed(2),
        avgOrderValue: avgOrderValue.toFixed(2),
        repeatCustomers,
        repeatRate: ((repeatCustomers / totalCustomers) * 100).toFixed(1) + '%'
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching customer stats'
    });
  }
};

// @desc    Add funds to customer wallet
// @route   POST /api/customers/:id/wallet/add
// @access  Private
exports.addWalletBalance = async (req, res) => {
  try {
    const { amount, description } = req.body;
    
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount is required' });
    }

    const customer = await Customer.findOne({
      _id: req.params.id,
      restaurantId: req.user.restaurantId
    });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const amountNum = Number(amount);
    customer.walletBalance = (customer.walletBalance || 0) + amountNum;
    customer.walletTransactions.push({
      type: 'CREDIT',
      amount: amountNum,
      description: description || 'Wallet Top-up',
      date: new Date()
    });

    await customer.save();

    res.json({ 
      success: true, 
      message: 'Wallet balance updated',
      data: enrichWithLoyaltyTier(customer) 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Unable to update wallet' });
  }
};

module.exports = exports;
