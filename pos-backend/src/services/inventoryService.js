const Ingredient = require('../models/Ingredient');
const MenuItem = require('../models/MenuItem');
const InventoryTransaction = require('../models/InventoryTransaction');

const getIngredientMap = async (ingredientIds = []) => {
  if (!ingredientIds.length) return new Map();
  const ingredients = await Ingredient.find({ _id: { $in: ingredientIds } }).select('unitCost name');
  const map = new Map();
  ingredients.forEach((ingredient) => {
    map.set(ingredient._id.toString(), ingredient);
  });
  return map;
};

exports.adjustIngredientStock = async ({
  restaurantId,
  ingredientId,
  quantity,
  type,
  unitCost = 0,
  referenceModel,
  referenceId,
  notes,
  createdBy
}) => {
  const ingredient = await Ingredient.findOne({ _id: ingredientId, restaurantId });
  if (!ingredient) {
    return null;
  }

  ingredient.currentStock = Math.max(0, ingredient.currentStock + quantity);

  if (type === 'PURCHASE') {
    ingredient.lastRestockedAt = new Date();
    if (unitCost > 0) {
      ingredient.lastPurchasePrice = unitCost;
    }
  }

  if (type === 'CONSUMPTION') {
    ingredient.consumptionQuantity += Math.abs(quantity);
  }

  if (type === 'WASTAGE') {
    ingredient.wastageQuantity += Math.abs(quantity);
    ingredient.wastageValue += Math.abs(quantity) * unitCost;
  }

  ingredient.recalculateLowStock();
  await ingredient.save();

  const amount = unitCost * Math.abs(quantity);
  await InventoryTransaction.create({
    restaurantId,
    ingredientId,
    type,
    quantity,
    unitCost,
    amount,
    referenceModel,
    referenceId,
    notes,
    createdBy
  });

  return ingredient;
};

exports.consumeIngredientsForOrder = async ({ order, restaurantId, createdBy }) => {
  if (!order?.items?.length) {
    return;
  }

  const menuItemIds = order.items
    .map((item) => item.menuItemId)
    .filter(Boolean);

  if (!menuItemIds.length) {
    return;
  }

  const menuItems = await MenuItem.find({ _id: { $in: menuItemIds } }).select('recipe');
  const recipeMap = new Map();
  menuItems.forEach((menuItem) => {
    recipeMap.set(menuItem._id.toString(), menuItem.recipe || []);
  });

  const adjustments = new Map();

  order.items.forEach((item) => {
    const recipe = recipeMap.get(item.menuItemId.toString());
    if (!recipe) return;
    recipe.forEach((component) => {
      if (!component.ingredient || !component.quantity) return;
      const key = component.ingredient.toString();
      const totalQty = component.quantity * item.quantity;
      if (totalQty <= 0) return;
      adjustments.set(key, (adjustments.get(key) || 0) + totalQty);
    });
  });

  const promises = [];
  adjustments.forEach((qty, ingredientId) => {
    promises.push(
      exports.adjustIngredientStock({
        restaurantId,
        ingredientId,
        quantity: -qty,
        type: 'CONSUMPTION',
        referenceModel: 'Order',
        referenceId: order._id,
        createdBy
      })
    );
  });

  await Promise.all(promises);
};

exports.calculateRecipeCost = async (recipe = []) => {
  if (!recipe.length) return 0;
  const ingredientIds = recipe.map((component) => component.ingredient).filter(Boolean);
  const ingredientMap = await getIngredientMap(ingredientIds);
  return recipe.reduce((sum, component) => {
    const ingredient = ingredientMap.get(component.ingredient?.toString());
    if (!ingredient) return sum;
    return sum + (ingredient.unitCost || 0) * (component.quantity || 0);
  }, 0);
};

exports.updateMenuItemRecipe = async ({ menuItemId, restaurantId, components = [] }) => {
  const sanitized = components
    .filter((component) => component.ingredient && component.quantity > 0)
    .map((component) => ({
      ingredient: component.ingredient,
      quantity: component.quantity,
      unit: component.unit || 'UNIT'
    }));

  const foodCost = await exports.calculateRecipeCost(sanitized);

  const updated = await MenuItem.findOneAndUpdate(
    { _id: menuItemId, restaurantId },
    { recipe: sanitized, foodCost },
    { new: true }
  ).populate('recipe.ingredient', 'name unit unitCost');

  return updated;
};

exports.receivePurchaseOrder = async ({ purchaseOrder, userId, adjustments = [] }) => {
  const fallbackItems = purchaseOrder?.items || [];
  const lines = adjustments.length
    ? adjustments
    : fallbackItems.map((item) => ({
        ingredientId: item.ingredientId,
        quantity: item.quantityOrdered,
        unitCost: item.unitCost
      }));

  const operations = lines
    .filter((line) => line.ingredientId && line.quantity > 0)
    .map((line) =>
      exports.adjustIngredientStock({
        restaurantId: purchaseOrder.restaurantId,
        ingredientId: line.ingredientId,
        quantity: line.quantity,
        type: 'PURCHASE',
        unitCost: line.unitCost,
        referenceModel: 'PurchaseOrder',
        referenceId: purchaseOrder._id,
        notes: `Purchase order ${purchaseOrder.orderNumber}`,
        createdBy: userId
      })
    );

  if (!operations.length) {
    return null;
  }

  await Promise.all(operations);
};

exports.generateInventorySnapshot = async ({ restaurantId }) => {
  const ingredients = await Ingredient.find({ restaurantId }).select('name currentStock unit lowStock reorderPoint parLevel unitCost');
  const summary = {
    totalIngredients: ingredients.length,
    lowStock: ingredients.filter((i) => i.lowStock).length,
    stockValue: ingredients.reduce((sum, ingredient) => sum + (ingredient.currentStock * ingredient.unitCost || 0), 0)
  };
  return { summary, ingredients };
};
