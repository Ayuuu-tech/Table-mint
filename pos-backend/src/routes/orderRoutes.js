const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOrder,
  getOrders,
  updateOrder,
  addItemToOrder,
  updateItemQuantity,
  removeItemFromOrder,
  cancelOrder
} = require('../controllers/orderController');
const { protect, checkSubscription } = require('../middleware/auth');

router.post('/', protect, checkSubscription, createOrder);
router.get('/', protect, checkSubscription, getOrders);
router.get('/:id', protect, checkSubscription, getOrder);
router.put('/:id', protect, checkSubscription, updateOrder);
router.post('/:id/items', protect, checkSubscription, addItemToOrder);
router.patch('/:orderId/items/:itemId', protect, checkSubscription, updateItemQuantity);
router.delete('/:orderId/items/:itemId', protect, checkSubscription, removeItemFromOrder);
router.delete('/:id', protect, checkSubscription, cancelOrder);

module.exports = router;
