/**
 * Database Transaction Helper
 * Provides utilities for MongoDB transactions
 */

const mongoose = require('mongoose');

/**
 * Execute operations within a transaction
 * Automatically rollbacks on error
 */
const executeWithTransaction = async (callback) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const result = await callback(session);
    await session.commitTransaction();
    session.endSession();
    return result;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

/**
 * Execute multiple database operations atomically
 * Example for split bills:
 * 
 * const results = await executeWithTransaction(async (session) => {
 *   // Create bill
 *   const bill = await Bill.create([{ ...billData }], { session });
 *   
 *   // Create bill payments record
 *   const payments = await BillPayment.create(
 *     splitDetails.map(s => ({ ...s, billId: bill[0]._id })),
 *     { session }
 *   );
 *   
 *   // Update table status
 *   await Table.findByIdAndUpdate(
 *     tableId,
 *     { status: 'AVAILABLE' },
 *     { session }
 *   );
 *   
 *   return { bill: bill[0], payments };
 * });
 */

/**
 * Transaction helper for split bills
 */
const processSplitBill = async (billData, splitDetails, tableId) => {
  return executeWithTransaction(async (session) => {
    try {
      // Step 1: Create main bill
      const Bill = require('../models/Bill');
      const bills = await Bill.create([billData], { session });
      const bill = bills[0];

      // Step 2: Create split bill records
      const splitBillRecords = splitDetails.map(split => ({
        billId: bill._id,
        customerName: split.customerName,
        amount: split.amount,
        paymentMode: split.paymentMode,
        paid: false
      }));

      // Note: Create custom SplitBillPayment model if needed
      // For now, update bill with split details
      bill.splitDetails = splitDetails;
      await bill.save({ session });

      // Step 3: Update table status
      const Table = require('../models/Table');
      await Table.findByIdAndUpdate(
        tableId,
        { status: 'AVAILABLE' },
        { session, new: true }
      );

      return {
        success: true,
        bill,
        message: 'Split bill processed successfully'
      };
    } catch (error) {
      throw new Error(`Split bill processing failed: ${error.message}`);
    }
  });
};

/**
 * Transaction helper for order to bill conversion
 */
const convertOrderToBill = async (orderId, paymentMode, session = null) => {
  const Order = require('../models/Order');
  const Bill = require('../models/Bill');
  const Table = require('../models/Table');

  const callback = async (txSession) => {
    try {
      // Fetch order
      const order = await Order.findById(orderId).session(txSession);
      if (!order) throw new Error('Order not found');

      // Create bill from order
      const billNumber = `BILL-${Date.now()}`;
      const billData = {
        orderId: order._id,
        restaurantId: order.restaurantId,
        tableNumber: order.tableNumber,
        billNumber,
        items: order.items,
        subtotal: order.subtotal,
        tax: order.tax,
        taxPercentage: order.taxPercentage,
        discount: order.discount,
        totalAmount: order.totalAmount,
        paymentMode,
        paymentStatus: 'PAID',
        createdBy: order.createdBy
      };

      const bill = await Bill.create([billData], { session: txSession });

      // Update order status
      order.status = 'PAID';
      await order.save({ session: txSession });

      // Update table status
      await Table.findByIdAndUpdate(
        order.tableId,
        { status: 'AVAILABLE' },
        { session: txSession }
      );

      return bill[0];
    } catch (error) {
      throw new Error(`Order to bill conversion failed: ${error.message}`);
    }
  };

  if (session) {
    return callback(session);
  } else {
    return executeWithTransaction(callback);
  }
};

/**
 * Get session for manual transaction control
 */
const getSession = async () => {
  const session = await mongoose.startSession();
  session.startTransaction();
  return session;
};

/**
 * Commit transaction
 */
const commitTransaction = async (session) => {
  if (session.inTransaction()) {
    await session.commitTransaction();
  }
  session.endSession();
};

/**
 * Abort transaction
 */
const abortTransaction = async (session) => {
  if (session.inTransaction()) {
    await session.abortTransaction();
  }
  session.endSession();
};

module.exports = {
  executeWithTransaction,
  processSplitBill,
  convertOrderToBill,
  getSession,
  commitTransaction,
  abortTransaction
};
