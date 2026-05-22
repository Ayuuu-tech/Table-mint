const express = require('express');
const router = express.Router();
const {
  getMenuItems,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleAvailability,
  uploadMenuItemImage
} = require('../controllers/menuController');
const { protect, authorize, checkSubscription } = require('../middleware/auth');

router.get('/', protect, checkSubscription, getMenuItems);
router.get('/:id', protect, getMenuItem);
router.post('/', protect, authorize('OWNER', 'CASHIER'), checkSubscription, createMenuItem);
router.put('/:id', protect, authorize('OWNER', 'CASHIER'), checkSubscription, updateMenuItem);
router.delete('/:id', protect, authorize('OWNER', 'CASHIER'), deleteMenuItem);
router.patch('/:id/availability', protect, checkSubscription, toggleAvailability);
router.post('/:id/upload-image', protect, authorize('OWNER', 'CASHIER'), checkSubscription, uploadMenuItemImage);

module.exports = router;
