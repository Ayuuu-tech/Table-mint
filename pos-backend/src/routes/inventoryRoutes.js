const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const inventoryController = require('../controllers/inventoryController');

router.get('/dashboard', protect, authorize('OWNER', 'MANAGER'), inventoryController.getInventoryDashboard);

router.get('/ingredients', protect, inventoryController.getIngredients);
router.post('/ingredients', protect, authorize('OWNER', 'MANAGER'), inventoryController.createIngredient);
router.put('/ingredients/:id', protect, authorize('OWNER', 'MANAGER'), inventoryController.updateIngredient);
router.patch('/ingredients/:id/stock', protect, authorize('OWNER', 'MANAGER'), inventoryController.adjustStock);

router.get('/vendors', protect, inventoryController.getVendors);
router.post('/vendors', protect, authorize('OWNER', 'MANAGER'), inventoryController.createVendor);
router.put('/vendors/:id', protect, authorize('OWNER', 'MANAGER'), inventoryController.updateVendor);

router.get('/purchase-orders', protect, authorize('OWNER', 'MANAGER'), inventoryController.getPurchaseOrders);
router.post('/purchase-orders', protect, authorize('OWNER', 'MANAGER'), inventoryController.createPurchaseOrder);
router.patch('/purchase-orders/:id/status', protect, authorize('OWNER', 'MANAGER'), inventoryController.updatePurchaseOrderStatus);

router.get('/ledger', protect, authorize('OWNER', 'MANAGER'), inventoryController.getStockLedger);
router.get('/reports/stock', protect, authorize('OWNER', 'MANAGER'), inventoryController.getStockReport);

router.get('/recipes/:menuItemId', protect, authorize('OWNER', 'MANAGER'), inventoryController.getMenuItemRecipe);
router.put('/recipes/:menuItemId', protect, authorize('OWNER', 'MANAGER'), inventoryController.updateMenuItemRecipe);

module.exports = router;
