const express = require('express');
const router = express.Router();
const {
  getTables,
  getTable,
  createTable,
  updateTable,
  deleteTable,
  getTableOrder
} = require('../controllers/tableController');
const { protect, authorize, checkSubscription } = require('../middleware/auth');

router.get('/', protect, checkSubscription, getTables);
router.get('/:id', protect, checkSubscription, getTable);
router.post('/', protect, authorize('OWNER', 'CASHIER'), checkSubscription, createTable);
router.put('/:id', protect, authorize('OWNER', 'CASHIER'), checkSubscription, updateTable);
router.delete('/:id', protect, authorize('OWNER', 'CASHIER'), deleteTable);
router.get('/:id/order', protect, checkSubscription, getTableOrder);

module.exports = router;
