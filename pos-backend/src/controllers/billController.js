const Bill = require('../models/Bill');
const Order = require('../models/Order');
const Table = require('../models/Table');
const MenuItem = require('../models/MenuItem');
const Restaurant = require('../models/Restaurant');
const Customer = require('../models/Customer');
const { findOrCreateCustomer, recordVisit, adjustLoyaltyPoints } = require('../services/customerService');
const inventoryService = require('../services/inventoryService');
const { sendNotification } = require('./notificationController');
const smsService = require('../services/smsService');
const pdfService = require('../services/pdfService');
const QRCode = require('qrcode'); // Need to install this pkg

// @desc    Generate bill from order (Complete Payment)
// @route   POST /api/bills
// @access  Private
exports.generateBill = async (req, res) => {
  try {
    const {
      orderId,
      paymentMode,
      customerName,
      customerPhone,
      customerEmail,
      customerId,
      notes,
      loyaltyPointsToRedeem = 0,
      partials = []
    } = req.body;

    // Get order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status !== 'OPEN') {
      return res.status(400).json({
        success: false,
        message: 'Order is already closed'
      });
    }

    // Get restaurant for tax settings
    const restaurant = await Restaurant.findById(req.user.restaurantId);

    // Create bill
    let customerDoc = null;
    if (customerId || customerPhone || customerName || customerEmail) {
      customerDoc = await findOrCreateCustomer({
        restaurantId: req.user.restaurantId,
        customerId,
        name: customerName || 'Guest Diner',
        phone: customerPhone,
        email: customerEmail,
        createdBy: req.user.id
      });
    }

    let loyaltyPointsRedeemed = 0;
    if (customerDoc && loyaltyPointsToRedeem > 0) {
      try {
        await adjustLoyaltyPoints({
          customerId: customerDoc._id,
          points: Number(loyaltyPointsToRedeem),
          type: 'REDEEM',
          reason: 'BILL_PAYMENT',
          referenceId: order._id
        });
        loyaltyPointsRedeemed = Number(loyaltyPointsToRedeem);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: error.message || 'Unable to redeem loyalty points'
        });
      }
    }

    const baseAmountPerPoint = restaurant?.settings?.loyalty?.amountPerPoint || 100;
    const pointMultiplier = restaurant?.settings?.loyalty?.earnRate || 1;
    const loyaltyPointsEarned = customerDoc
      ? Math.max(0, Math.floor((order.totalAmount / baseAmountPerPoint) * pointMultiplier))
      : 0;

    // Validate Wallet Balance
    if (paymentMode === 'WALLET') {
      if (!customerDoc) {
        return res.status(400).json({ success: false, message: 'Customer is required for Wallet payment' });
      }
      if (customerDoc.walletBalance < order.totalAmount) {
        return res.status(400).json({ success: false, message: `Insufficient wallet balance. Available: ${customerDoc.walletBalance}` });
      }
    } else if (paymentMode === 'PARTIAL' && partials && partials.length > 0) {
      const walletPayment = partials.find(p => p.paymentMode === 'WALLET');
      if (walletPayment) {
        if (!customerDoc) return res.status(400).json({ success: false, message: 'Customer required for Wallet partial payment' });
        if (customerDoc.walletBalance < walletPayment.amount) {
          return res.status(400).json({ success: false, message: `Insufficient wallet balance for partial payment.` });
        }
      }
    }

    // Feature 6: Tax Compliance - Fetch HSN & Rate Details
    const menuItemIds = order.items.map(item => item.menuItemId);
    const menuItems = await MenuItem.find({ _id: { $in: menuItemIds } });

    const billItems = order.items.map(item => {
      const menuItem = menuItems.find(m => m._id.toString() === item.menuItemId?.toString());
      // Prefer Order's taxRate (frozen at time of order), fallback to Menu
      const taxRate = item.taxRate !== undefined ? item.taxRate : (menuItem?.taxRate || 5);
      const hsnCode = menuItem?.hsnCode || '';
      const taxAmount = (item.itemTotal * taxRate) / 100;

      return {
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        itemTotal: item.itemTotal,
        variant: item.selectedVariant, // Capture variant details
        modifiers: item.selectedModifiers, // Capture modifiers
        hsnCode: hsnCode,
        taxRate: taxRate,
        taxAmount: taxAmount
      };
    });

    // Calculate Tax Breakdown (Default to CGST + SGST split)
    let cgst = 0, sgst = 0;
    billItems.forEach(item => {
      // 50-50 Split
      const tax = item.taxAmount || 0;
      cgst += tax / 2;
      sgst += tax / 2;
    });

    const bill = await Bill.create({
      restaurantId: req.user.restaurantId,
      orderId: order._id,
      tableNumber: order.tableNumber,
      items: billItems,
      subtotal: order.subtotal,
      tax: order.tax, // Use Total Tax
      taxBreakdown: {
        cgst: Number(cgst.toFixed(2)),
        sgst: Number(sgst.toFixed(2)),
        igst: 0,
        cess: 0
      },
      taxPercentage: 0, // Item-wise tax renders this obsolete, but keeping schema valid
      discount: order.discount,
      totalAmount: order.totalAmount,
      paymentMode: paymentMode || 'CASH',
      paidAmount: paymentMode === 'PARTIAL'
        ? partials.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
        : (['WALLET', 'CASH', 'CARD', 'UPI'].includes(paymentMode || 'CASH') ? order.totalAmount : 0),
      paymentStatus: (paymentMode === 'SPLIT') ? 'PENDING' :
        (paymentMode === 'PARTIAL' && partials.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) < order.totalAmount) ? 'PARTIAL' :
          'PAID',
      partials: partials,
      customer: customerDoc?._id,
      customerName: customerDoc?.name || customerName,
      customerPhone: customerDoc?.phone || customerPhone,
      customerEmail: customerDoc?.email || customerEmail,
      loyaltyPointsEarned,
      loyaltyPointsRedeemed,
      customerLifetimeValueSnapshot: customerDoc?.lifetimeValue || 0,
      notes,
      createdBy: req.user.id
    });

    // Deduct Wallet Balance
    if (customerDoc) {
      if (paymentMode === 'WALLET') {
        customerDoc.walletBalance -= bill.totalAmount;
        customerDoc.walletTransactions.push({
          type: 'SPEND',
          amount: bill.totalAmount,
          description: `Bill Payment ${bill.billNumber}`,
          balanceAfter: customerDoc.walletBalance,
          date: new Date()
        });
        await customerDoc.save();
      } else if (paymentMode === 'PARTIAL') {
        const walletPart = partials.find(p => p.paymentMode === 'WALLET');
        if (walletPart) {
          customerDoc.walletBalance -= walletPart.amount;
          customerDoc.walletTransactions.push({
            type: 'SPEND',
            amount: walletPart.amount,
            description: `Partial Bill Payment ${bill.billNumber}`,
            balanceAfter: customerDoc.walletBalance,
            date: new Date()
          });
          await customerDoc.save();
        }
      }
    }

    // Update order status
    order.status = 'PAID';
    order.closedAt = Date.now();
    await order.save();

    // Update table status
    const table = await Table.findById(order.tableId);
    if (table) {
      table.status = 'AVAILABLE';
      table.currentOrderId = null;
      await table.save();
    }

    // Broadcast real-time bill generation
    const realtime = req.app.locals.realtime;
    if (realtime) {
      realtime.notifyBillGenerated(req.user.restaurantId, {
        billId: bill._id,
        billNumber: bill.billNumber,
        tableNumber: bill.tableNumber,
        totalAmount: bill.totalAmount,
        paymentMode: bill.paymentMode,
        createdBy: req.user.id,
        timestamp: new Date()
      });
    }

    await inventoryService.consumeIngredientsForOrder({
      order,
      restaurantId: req.user.restaurantId,
      createdBy: req.user.id
    });

    // Check & Send SMS Receipt
    if (bill.customerPhone) {
      // Run in background so we don't delay response
      smsService.sendReceipt(bill.customerPhone, bill.billNumber, bill.totalAmount)
        .catch(err => console.error('Failed to send receipt SMS:', err));
    }

    if (customerDoc) {
      await recordVisit({
        customerId: customerDoc._id,
        referenceId: bill._id,
        visitType: 'ORDER',
        amount: bill.totalAmount,
        notes: `Bill ${bill.billNumber}`
      });

      if (loyaltyPointsEarned > 0) {
        await adjustLoyaltyPoints({
          customerId: customerDoc._id,
          points: loyaltyPointsEarned,
          type: 'EARN',
          reason: 'BILL_PAYMENT',
          referenceId: bill._id
        });
      }
    }

    res.status(201).json({
      success: true,
      message: 'Bill generated successfully',
      data: bill
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error generating bill'
    });
  }
};

// @desc    Get all bills
// @route   GET /api/bills
// @access  Private
exports.getBills = async (req, res) => {
  try {
    const { startDate, endDate, paymentMode } = req.query;

    const filter = { restaurantId: req.user.restaurantId };

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (paymentMode) filter.paymentMode = paymentMode;

    const bills = await Bill.find(filter)
      .populate('createdBy', 'name')
      .populate('customer', 'name phone email loyaltyPoints loyaltyTier')
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({
      success: true,
      count: bills.length,
      data: bills
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching bills'
    });
  }
};

// @desc    Get single bill
// @route   GET /api/bills/:id
// @access  Private
exports.getBill = async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id)
      .populate('orderId')
      .populate('createdBy', 'name')
      .populate('customer', 'name phone email loyaltyPoints loyaltyTier visitCount lifetimeValue');

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found'
      });
    }

    res.status(200).json({
      success: true,
      data: bill
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching bill'
    });
  }
};

// @desc    Get bill by bill number
// @route   GET /api/bills/number/:billNumber
// @access  Private
exports.getBillByNumber = async (req, res) => {
  try {
    const bill = await Bill.findOne({
      billNumber: req.params.billNumber,
      restaurantId: req.user.restaurantId
    })
      .populate('createdBy', 'name')
      .populate('customer', 'name phone email loyaltyPoints loyaltyTier visitCount lifetimeValue');

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found'
      });
    }

    res.status(200).json({
      success: true,
      data: bill
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching bill'
    });
  }
};

// @desc    Report failed payment for alert
// @route   POST /api/bills/failed-payment
// @access  Private
exports.reportFailedPayment = async (req, res) => {
  try {
    const { amount, customerName, reason, tableNumber } = req.body;

    const notification = await sendNotification(
      req.user.restaurantId,
      {
        type: 'FAILED_PAYMENT',
        priority: 'URGENT',
        title: 'Payment Failed',
        message: `Payment of ₹${amount} failed for ${customerName || 'Customer'} (Table ${tableNumber || 'Unknown'}). Reason: ${reason || 'Unknown'}`,
        data: { amount, customerName, reason, tableNumber },
        sentVia: ['IN_APP']
      }
    );

    // Emit socket for notification
    if (req.app.get('io')) {
      req.app.get('io').to(`restaurant:${req.user.restaurantId}`).emit('notification:new', notification);
    }

    res.status(200).json({
      success: true,
      message: 'Failed payment reported'
    });
  } catch (error) {
    console.error('Error reporting failed payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error reporting failed payment'
    });
  }
};

// @desc    Generate a UPI QR Code
// @route   POST /api/bills/qr
// @access  Private
exports.generatePaymentQR = async (req, res) => {
  try {
    const { amount, note } = req.body;

    if (!amount) {
      return res.status(400).json({ success: false, message: 'Amount is required' });
    }

    const restaurant = await Restaurant.findById(req.user.restaurantId);
    // Use configured UPI ID or fallback
    const vpa = restaurant?.paymentSettings?.upiId || restaurant?.email || 'merchant@upi';
    // Sanitize name for UPI string
    const name = restaurant?.name ? encodeURIComponent(restaurant.name) : 'Merchant';
    const transactionNote = note ? encodeURIComponent(note) : 'Bill%20Payment';

    // Construct UPI String: upi://pay?pa=...&pn=...&am=...&tn=...&cu=INR
    const upiString = `upi://pay?pa=${vpa}&pn=${name}&am=${amount}&tn=${transactionNote}&cu=INR`;

    const qrCodeDataUrl = await QRCode.toDataURL(upiString);

    res.status(200).json({
      success: true,
      data: {
        qrCode: qrCodeDataUrl,
        upiString
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error generating QR code'
    });
  }
};

// @desc    Download GST Invoice PDF
// @route   GET /api/bills/:id/pdf
// @access  Private
exports.downloadInvoicePDF = async (req, res) => {
  try {
    const { id } = req.params;
    const { restaurantId } = req.user;

    // Get bill with all details
    const bill = await Bill.findOne({ _id: id, restaurantId })
      .populate('customer')
      .populate('orderId');

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found'
      });
    }

    // Get restaurant details
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    // Generate PDF
    const pdfBuffer = await pdfService.generateInvoicePDF(bill, restaurant, bill.orderId);

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Invoice-${bill.billNumber}.pdf`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating PDF invoice',
      error: error.message
    });
  }
};

// @desc    Get Invoice PDF as Base64 (for embedding/preview)
// @route   GET /api/bills/:id/pdf/preview
// @access  Private
exports.getInvoicePDFPreview = async (req, res) => {
  try {
    const { id } = req.params;
    const { restaurantId } = req.user;

    const bill = await Bill.findOne({ _id: id, restaurantId })
      .populate('customer')
      .populate('orderId');

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found'
      });
    }

    const restaurant = await Restaurant.findById(restaurantId);

    const pdfBuffer = await pdfService.generateInvoicePDF(bill, restaurant, bill.orderId);
    const base64 = pdfBuffer.toString('base64');

    res.status(200).json({
      success: true,
      data: {
        pdf: `data:application/pdf;base64,${base64}`,
        filename: `Invoice-${bill.billNumber}.pdf`
      }
    });
  } catch (error) {
    console.error('Error generating PDF preview:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating PDF preview',
      error: error.message
    });
  }
};
