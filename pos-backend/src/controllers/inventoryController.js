const Ingredient = require('../models/Ingredient');
const Vendor = require('../models/Vendor');
const PurchaseOrder = require('../models/PurchaseOrder');
const InventoryTransaction = require('../models/InventoryTransaction');
const MenuItem = require('../models/MenuItem');
const inventoryService = require('../services/inventoryService');

const buildPagination = (page, limit, total) => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit) || 1,
  hasNextPage: page * limit < total,
  hasPrevPage: page > 1
});

exports.getInventoryDashboard = async (req, res) => {
  try {
    const restaurantId = req.user.restaurantId;
    
    // Fetch all data in parallel for better performance
    const [snapshot, vendors, purchaseOrders, transactions] = await Promise.all([
      inventoryService.generateInventorySnapshot({ restaurantId }),
      Vendor.find({ restaurantId }).sort({ isPreferred: -1, name: 1 }),
      PurchaseOrder.find({ restaurantId })
        .sort({ createdAt: -1 })
        .populate('vendorId', 'name phone')
        .populate('items.ingredientId', 'name unit'),
      InventoryTransaction.find({ restaurantId })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('ingredientId', 'name unit')
    ]);

    // Safely handle potentially undefined snapshot
    const ingredients = snapshot?.ingredients || [];
    
    // Calculate summary metrics with safe defaults
    const totalIngredients = ingredients.length;
    const lowStockCount = ingredients.filter((ing) => ing?.lowStock).length;
    const totalInventoryValue = ingredients.reduce((sum, ing) => {
      if (!ing) return sum;
      return sum + ((ing.currentStock || 0) * (ing.averageCost || ing.unitCost || 0));
    }, 0);
    const pendingOrders = purchaseOrders.filter((po) => 
      po.status === 'DRAFT' || po.status === 'ORDERED' || po.status === 'PARTIAL'
    ).length;

    const summary = {
      totalIngredients,
      lowStockCount,
      totalInventoryValue,
      pendingOrders
    };

    res.json({
      success: true,
      data: {
        summary,
        ingredients,
        vendors: vendors || [],
        purchaseOrders: purchaseOrders || [],
        transactions: transactions || []
      }
    });
  } catch (error) {
    console.error('Error in getInventoryDashboard:', error);
    res.status(500).json({ success: false, message: error.message || 'Unable to load inventory dashboard' });
  }
};

exports.getIngredients = async (req, res) => {
  try {
    const { search, lowStock } = req.query;
    const filter = { restaurantId: req.user.restaurantId };
    if (lowStock === 'true') {
      filter.lowStock = true;
    }
    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { sku: new RegExp(search, 'i') }
      ];
    }
    const ingredients = await Ingredient.find(filter).sort({ name: 1 }).populate('vendor', 'name phone');
    res.json({ success: true, data: ingredients });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Unable to fetch ingredients' });
  }
};

exports.createIngredient = async (req, res) => {
  try {
    const ingredient = await Ingredient.create({
      ...req.body,
      restaurantId: req.user.restaurantId,
      createdBy: req.user.id,
      updatedBy: req.user.id
    });
    res.status(201).json({ success: true, data: ingredient });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Unable to create ingredient' });
  }
};

exports.updateIngredient = async (req, res) => {
  try {
    const ingredient = await Ingredient.findOneAndUpdate(
      { _id: req.params.id, restaurantId: req.user.restaurantId },
      { ...req.body, updatedBy: req.user.id },
      { new: true, runValidators: true }
    );

    if (!ingredient) {
      return res.status(404).json({ success: false, message: 'Ingredient not found' });
    }

    res.json({ success: true, data: ingredient });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Unable to update ingredient' });
  }
};

exports.adjustStock = async (req, res) => {
  try {
    const { quantity, type, notes } = req.body;
    if (!quantity || !type) {
      return res.status(400).json({ success: false, message: 'Quantity and type are required' });
    }

    const ingredient = await inventoryService.adjustIngredientStock({
      restaurantId: req.user.restaurantId,
      ingredientId: req.params.id,
      quantity: Number(quantity),
      type,
      notes,
      createdBy: req.user.id
    });

    if (!ingredient) {
      return res.status(404).json({ success: false, message: 'Ingredient not found' });
    }

    res.json({ success: true, data: ingredient });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Unable to adjust stock' });
  }
};

exports.getVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find({ restaurantId: req.user.restaurantId }).sort({ isPreferred: -1, name: 1 });
    res.json({ success: true, data: vendors });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to fetch vendors' });
  }
};

exports.createVendor = async (req, res) => {
  try {
    const vendor = await Vendor.create({
      ...req.body,
      restaurantId: req.user.restaurantId
    });
    res.status(201).json({ success: true, data: vendor });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Unable to create vendor' });
  }
};

exports.updateVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findOneAndUpdate(
      { _id: req.params.id, restaurantId: req.user.restaurantId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    res.json({ success: true, data: vendor });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Unable to update vendor' });
  }
};

exports.getPurchaseOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const filter = { restaurantId: req.user.restaurantId };
    if (status) filter.status = status;

    const [orders, total] = await Promise.all([
      PurchaseOrder.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit, 10))
        .populate('vendorId', 'name phone')
        .populate('items.ingredientId', 'name unit'),
      PurchaseOrder.countDocuments(filter)
    ]);

    res.json({ success: true, data: orders, pagination: buildPagination(Number(page), Number(limit), total) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to fetch purchase orders' });
  }
};

exports.createPurchaseOrder = async (req, res) => {
  try {
    const items = (req.body.items || []).map((item) => ({
      ...item,
      amount: Number(item.quantityOrdered || 0) * Number(item.unitCost || 0)
    }));

    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const purchaseOrder = await PurchaseOrder.create({
      ...req.body,
      restaurantId: req.user.restaurantId,
      items,
      subtotal,
      totalAmount: subtotal,
      createdBy: req.user.id,
      updatedBy: req.user.id
    });

    res.status(201).json({ success: true, data: purchaseOrder });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Unable to create purchase order' });
  }
};

exports.updatePurchaseOrderStatus = async (req, res) => {
  try {
    const { status, items = [] } = req.body;
    const purchaseOrder = await PurchaseOrder.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId })
      .populate('vendorId', 'name phone')
      .populate('items.ingredientId', 'name unit');

    if (!purchaseOrder) {
      return res.status(404).json({ success: false, message: 'Purchase order not found' });
    }

    const statusToApply = status || purchaseOrder.status;
    const allowedStatuses = ['DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED'];
    if (!allowedStatuses.includes(statusToApply)) {
      return res.status(400).json({ success: false, message: 'Invalid purchase order status' });
    }

    const itemMap = new Map();
    if (Array.isArray(items)) {
      items.forEach((item) => {
        if (!item?.ingredientId) return;
        const qty = Number(item.quantityReceived);
        if (Number.isNaN(qty)) return;
        itemMap.set(item.ingredientId.toString(), Math.max(0, qty));
      });
    }

    const adjustments = [];
    if (itemMap.size) {
      purchaseOrder.items = purchaseOrder.items.map((line) => {
        const key = line.ingredientId?._id ? line.ingredientId._id.toString() : line.ingredientId.toString();
        if (!itemMap.has(key)) return line;
        const desired = Math.min(line.quantityOrdered, itemMap.get(key));
        const current = line.quantityReceived || 0;
        const delta = desired - current;
        if (delta > 0) {
          adjustments.push({
            ingredientId: line.ingredientId,
            quantity: delta,
            unitCost: line.unitCost
          });
        }
        line.quantityReceived = desired;
        return line;
      });
    }

    if (statusToApply === 'ORDERED' && !purchaseOrder.orderedAt) {
      purchaseOrder.orderedAt = new Date();
    }

    if (statusToApply === 'RECEIVED') {
      const fullyReceived = purchaseOrder.items.every((line) => (line.quantityReceived || 0) >= line.quantityOrdered);
      if (!fullyReceived) {
        purchaseOrder.status = 'PARTIAL';
      } else {
        purchaseOrder.status = 'RECEIVED';
        purchaseOrder.receivedAt = purchaseOrder.receivedAt || new Date();
      }
    } else {
      purchaseOrder.status = statusToApply;
    }

    purchaseOrder.updatedBy = req.user.id;

    if (['PARTIAL', 'RECEIVED'].includes(purchaseOrder.status) && adjustments.length) {
      await inventoryService.receivePurchaseOrder({ purchaseOrder, userId: req.user.id, adjustments });
    }

    await purchaseOrder.save();

    res.json({ success: true, data: purchaseOrder });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Unable to update purchase order' });
  }
};

exports.getStockLedger = async (req, res) => {
  try {
    const { ingredientId, limit = 50 } = req.query;
    const filter = { restaurantId: req.user.restaurantId };
    if (ingredientId) filter.ingredientId = ingredientId;

    const entries = await InventoryTransaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10))
      .populate('ingredientId', 'name unit');

    res.json({ success: true, data: entries });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to fetch stock ledger' });
  }
};

exports.getStockReport = async (req, res) => {
  try {
    const ingredients = await Ingredient.find({ restaurantId: req.user.restaurantId }).select('name currentStock unit wastageQuantity wastageValue consumptionQuantity unitCost');
    const report = ingredients.map((ingredient) => ({
      name: ingredient.name,
      unit: ingredient.unit,
      currentStock: ingredient.currentStock,
      consumptionQuantity: ingredient.consumptionQuantity,
      wastageQuantity: ingredient.wastageQuantity,
      wastageValue: ingredient.wastageValue,
      stockValue: ingredient.currentStock * (ingredient.unitCost || 0)
    }));
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to generate stock report' });
  }
};

exports.getMenuItemRecipe = async (req, res) => {
  try {
    const menuItem = await MenuItem.findOne({ _id: req.params.menuItemId, restaurantId: req.user.restaurantId })
      .populate('recipe.ingredient', 'name unit unitCost currentStock');

    if (!menuItem) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }

    res.json({ success: true, data: menuItem.recipe, foodCost: menuItem.foodCost });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to fetch recipe' });
  }
};

exports.updateMenuItemRecipe = async (req, res) => {
  try {
    const updated = await inventoryService.updateMenuItemRecipe({
      menuItemId: req.params.menuItemId,
      restaurantId: req.user.restaurantId,
      components: req.body.components || []
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }

    res.json({ success: true, data: updated.recipe, foodCost: updated.foodCost });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Unable to update recipe' });
  }
};
