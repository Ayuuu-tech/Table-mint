const express = require("express");
const router = express.Router();
const Ingredient = require("../models/Ingredient");
const Vendor = require("../models/Vendor");
const PurchaseOrder = require("../models/PurchaseOrder");
const InventoryTransaction = require("../models/InventoryTransaction");
const { auth } = require("../middleware/auth");

/**
 * @route   GET /inventory/dashboard
 * @desc    Get consolidated dashboard data (summary, ingredients, vendors, purchase orders, transactions)
 * @access  Private
 */
router.get("/dashboard", auth, async (req, res) => {
  try {
    const restaurantId = req.user.restaurantId;

    // Execute all queries in parallel
    const [ingredients, vendors, purchaseOrders, transactions] = await Promise.all([
      Ingredient.find({ restaurantId }).lean(),
      Vendor.find({ restaurantId }).lean(),
      PurchaseOrder.find({ restaurantId })
        .populate("vendorId", "name")
        .populate("items.ingredientId", "name unit")
        .sort({ createdAt: -1 })
        .lean(),
      InventoryTransaction.find({ restaurantId })
        .populate("ingredientId", "name")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
    ]);

    // Calculate summary
    const totalIngredients = ingredients.length;
    const lowStockCount = ingredients.filter((ing) => ing.currentStock <= ing.reorderLevel).length;
    
    const totalInventoryValue = ingredients.reduce((sum, ing) => {
      return sum + (ing.currentStock * (ing.averageCost || 0));
    }, 0);

    const pendingOrders = purchaseOrders.filter((po) => 
      po.status === "DRAFT" || po.status === "ORDERED" || po.status === "PARTIAL"
    ).length;

    const summary = {
      totalIngredients,
      lowStockCount,
      totalInventoryValue,
      pendingOrders
    };

    res.json({
      summary,
      ingredients,
      vendors,
      purchaseOrders,
      transactions
    });
  } catch (error) {
    console.error("Error fetching inventory dashboard:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
