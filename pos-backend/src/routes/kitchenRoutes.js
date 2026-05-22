const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const kitchenController = require('../controllers/kitchenController');

// All kitchen routes require authentication
router.use(protect);

// Get active kitchen orders
router.get('/orders', kitchenController.getKitchenOrders);

// Get kitchen statistics
router.get('/stats', kitchenController.getKitchenStats);

// Update single item status
router.patch('/orders/:orderId/items/:itemId/status', kitchenController.updateItemStatus);

// Bulk start items (mark multiple items as PREPARING)
router.post('/orders/:orderId/bulk-start', kitchenController.bulkStartItems);

module.exports = router;
