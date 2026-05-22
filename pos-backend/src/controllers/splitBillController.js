const Bill = require('../models/Bill');
const Order = require('../models/Order');

// @desc    Split bill
// @route   POST /api/bills/:id/split
// @access  Private
exports.splitBill = async (req, res) => {
  try {
    const { splits } = req.body;
    
    if (!splits || !Array.isArray(splits) || splits.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'At least 2 splits required'
      });
    }

    const bill = await Bill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found'
      });
    }

    // Validate split amounts
    const totalSplitAmount = splits.reduce((sum, split) => sum + split.amount, 0);
    if (Math.abs(totalSplitAmount - bill.totalAmount) > 0.01) {
      return res.status(400).json({
        success: false,
        message: 'Split amounts must equal total bill amount'
      });
    }

    // Update bill with split details
    bill.isSplit = true;
    bill.splitDetails = splits.map(split => ({
      customerName: split.customerName || 'Guest',
      amount: split.amount,
      paymentMode: split.paymentMode || 'CASH',
      paid: split.paid !== undefined ? split.paid : true // Mark as paid by default
    }));

    // Check if all splits are paid
    const allPaid = bill.splitDetails.every(split => split.paid);
    if (allPaid) {
      bill.paymentStatus = 'PAID';
    }

    await bill.save();

    res.status(200).json({
      success: true,
      message: 'Bill split successfully',
      data: bill
    });
  } catch (error) {
    console.error('Split bill error:', error);
    res.status(500).json({
      success: false,
      message: 'Error splitting bill'
    });
  }
};

// @desc    Update split payment status
// @route   PATCH /api/bills/:id/split/:splitIndex/pay
// @access  Private
exports.updateSplitPayment = async (req, res) => {
  try {
    const { id, splitIndex } = req.params;
    const { paid, paymentMode } = req.body;

    const bill = await Bill.findById(id);
    if (!bill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found'
      });
    }

    if (!bill.isSplit || !bill.splitDetails[splitIndex]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid split index'
      });
    }

    bill.splitDetails[splitIndex].paid = paid !== undefined ? paid : true;
    if (paymentMode) {
      bill.splitDetails[splitIndex].paymentMode = paymentMode;
    }

    // Check if all splits are paid
    const allPaid = bill.splitDetails.every(split => split.paid);
    if (allPaid) {
      bill.paymentStatus = 'PAID';
    }

    await bill.save();

    res.status(200).json({
      success: true,
      message: 'Split payment updated',
      data: bill
    });
  } catch (error) {
    console.error('Update split payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating split payment'
    });
  }
};

// @desc    Get individual split bill details for download/print
// @route   GET /api/bills/:id/split/:splitIndex
// @access  Private
exports.getSplitBill = async (req, res) => {
  try {
    const { id, splitIndex } = req.params;

    const bill = await Bill.findById(id).populate('restaurantId');
    if (!bill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found'
      });
    }

    if (!bill.isSplit || !bill.splitDetails[splitIndex]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid split index'
      });
    }

    const splitDetail = bill.splitDetails[splitIndex];
    const splitBillData = {
      billNumber: `${bill.billNumber}-SPLIT-${parseInt(splitIndex) + 1}`,
      originalBillNumber: bill.billNumber,
      tableNumber: bill.tableNumber,
      customerName: splitDetail.customerName,
      amount: splitDetail.amount,
      paymentMode: splitDetail.paymentMode,
      paid: splitDetail.paid,
      createdAt: bill.createdAt,
      restaurantId: bill.restaurantId,
      splitIndex: parseInt(splitIndex) + 1,
      totalSplits: bill.splitDetails.length
    };

    res.status(200).json({
      success: true,
      data: splitBillData
    });
  } catch (error) {
    console.error('Get split bill error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching split bill'
    });
  }
};
