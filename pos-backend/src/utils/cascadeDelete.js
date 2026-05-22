/**
 * Cascade Delete Handler
 * Automatically deletes related documents when parent is deleted
 * Implements database referential integrity
 */

const mongoose = require('mongoose');
const { logOperation } = require('./logger');
const { DatabaseError } = require('./errors');

/**
 * Deletes a restaurant and all related documents
 * @param {string} restaurantId - Restaurant ID to delete
 * @param {object} session - MongoDB session for transaction
 * @returns {Promise<object>} - Report of deleted documents
 */
async function deleteRestaurantCascade(restaurantId, session = null) {
  const report = {
    restaurantId,
    timestamp: new Date(),
    deleted: {},
    errors: []
  };

  try {
    // Get restaurant first to verify it exists
    const Restaurant = mongoose.model('Restaurant');
    const restaurant = await Restaurant.findById(restaurantId).session(session);

    if (!restaurant) {
      throw new DatabaseError('Restaurant not found', { restaurantId });
    }

    // Order matters: delete dependent documents first
    const deleteOperations = [
      { model: 'Bill', field: 'restaurantId' },
      { model: 'Order', field: 'restaurantId' },
      { model: 'Reservation', field: 'restaurantId' },
      { model: 'Coupon', field: 'restaurantId' },
      { model: 'MenuItem', field: 'restaurantId' },
      { model: 'Table', field: 'restaurantId' },
      { model: 'Subscription', field: 'restaurantId' },
      { model: 'User', field: 'restaurantId' }
    ];

    for (const { model, field } of deleteOperations) {
      try {
        const Model = mongoose.model(model);
        const result = await Model.deleteMany(
          { [field]: restaurantId },
          { session }
        );
        report.deleted[model] = result.deletedCount;

        logOperation('cascade_delete', {
          parentModel: 'Restaurant',
          parentId: restaurantId,
          childModel: model,
          deletedCount: result.deletedCount
        });
      } catch (error) {
        report.errors.push({
          model,
          error: error.message
        });
      }
    }

    // Finally delete the restaurant itself
    await Restaurant.findByIdAndDelete(restaurantId).session(session);
    report.deleted.Restaurant = 1;

    return report;
  } catch (error) {
    throw new DatabaseError('Cascade delete failed', {
      restaurantId,
      error: error.message
    });
  }
}

/**
 * Deletes an order and related bills
 * @param {string} orderId - Order ID to delete
 * @param {object} session - MongoDB session for transaction
 * @returns {Promise<object>} - Report of deleted documents
 */
async function deleteOrderCascade(orderId, session = null) {
  const report = {
    orderId,
    timestamp: new Date(),
    deleted: {},
    errors: []
  };

  try {
    const Order = mongoose.model('Order');
    const order = await Order.findById(orderId).session(session);

    if (!order) {
      throw new DatabaseError('Order not found', { orderId });
    }

    // Delete related bills
    const Bill = mongoose.model('Bill');
    const billResult = await Bill.deleteMany(
      { orderId },
      { session }
    );
    report.deleted.Bill = billResult.deletedCount;

    // Delete the order
    await Order.findByIdAndDelete(orderId).session(session);
    report.deleted.Order = 1;

    logOperation('cascade_delete', {
      parentModel: 'Order',
      parentId: orderId,
      childModel: 'Bill',
      deletedCount: billResult.deletedCount
    });

    return report;
  } catch (error) {
    throw new DatabaseError('Cascade delete failed', {
      orderId,
      error: error.message
    });
  }
}

/**
 * Deletes a table and updates/deletes related orders
 * @param {string} tableId - Table ID to delete
 * @param {object} session - MongoDB session for transaction
 * @returns {Promise<object>} - Report of changes
 */
async function deleteTableCascade(tableId, session = null) {
  const report = {
    tableId,
    timestamp: new Date(),
    deleted: {},
    updated: {},
    errors: []
  };

  try {
    const Table = mongoose.model('Table');
    const table = await Table.findById(tableId).session(session);

    if (!table) {
      throw new DatabaseError('Table not found', { tableId });
    }

    const Order = mongoose.model('Order');

    // Get open orders on this table
    const openOrders = await Order.find({
      tableId,
      status: 'OPEN'
    }).session(session);

    // Cancel open orders
    for (const order of openOrders) {
      await Order.findByIdAndUpdate(
        order._id,
        {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: 'Table deleted'
        },
        { session }
      );
      report.updated.Order = (report.updated.Order || 0) + 1;
    }

    // Delete the table
    await Table.findByIdAndDelete(tableId).session(session);
    report.deleted.Table = 1;

    logOperation('cascade_delete', {
      parentModel: 'Table',
      parentId: tableId,
      actionsTaken: `Cancelled ${openOrders.length} open orders`
    });

    return report;
  } catch (error) {
    throw new DatabaseError('Cascade delete failed', {
      tableId,
      error: error.message
    });
  }
}

/**
 * Creates a pre-deleteOne hook for cascade deletion
 * @param {string} modelName - Model name that is being deleted
 * @param {function} cascadeHandler - Function to handle cascade deletion
 * @returns {function} - Mongoose hook function
 */
function createCascadeDeleteHook(cascadeHandler) {
  return async function(next) {
    try {
      const docToDelete = await this.model.findOne(this.getFilter());
      if (docToDelete) {
        await cascadeHandler(docToDelete._id);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Creates a pre-deleteMany hook for cascade deletion
 * @param {string} modelName - Model name
 * @param {function} cascadeHandler - Function to handle cascade deletion
 * @returns {function} - Mongoose hook function
 */
function createCascadeDeleteManyHook(modelName, cascadeHandler) {
  return async function(next) {
    try {
      const docsToDelete = await this.model.find(this.getFilter());
      for (const doc of docsToDelete) {
        await cascadeHandler(doc._id);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Configuration for cascade deletion rules
 * Maps model to its cascade deletion handler
 */
const CASCADE_DELETE_CONFIG = {
  Restaurant: deleteRestaurantCascade,
  Order: deleteOrderCascade,
  Table: deleteTableCascade
};

/**
 * Applies cascade delete hooks to a model
 * @param {object} schema - Mongoose schema
 * @param {string} modelName - Model name
 * @param {function} handler - Cascade handler function
 */
function applyCascadeDeleteHook(schema, modelName, handler) {
  schema.pre('deleteOne', function(next) {
    // Convert deleteOne to use custom handler
    const originalId = this.getFilter()._id;
    handler(originalId).catch(next).finally(() => next());
  });

  schema.pre('findByIdAndDelete', function(next) {
    const originalId = this._conditions._id || this.getOptions()._id;
    handler(originalId).catch(next).finally(() => next());
  });
}

/**
 * Checks if there are dependent documents before allowing delete
 * @param {string} modelName - Model to check dependencies for
 * @param {string} documentId - Document ID
 * @returns {Promise<object>} - {canDelete: boolean, dependents: []}
 */
async function checkDependencies(modelName, documentId) {
  const dependencies = {
    Restaurant: [
      { model: 'User', field: 'restaurantId' },
      { model: 'MenuItem', field: 'restaurantId' },
      { model: 'Order', field: 'restaurantId' },
      { model: 'Table', field: 'restaurantId' },
      { model: 'Bill', field: 'restaurantId' },
      { model: 'Coupon', field: 'restaurantId' },
      { model: 'Subscription', field: 'restaurantId' }
    ],
    Order: [
      { model: 'Bill', field: 'orderId' }
    ],
    MenuItem: [
      { model: 'Order', field: 'items.menuItemId' }
    ],
    User: [
      { model: 'Reservation', field: 'customerId' }
    ]
  };

  const checks = dependencies[modelName] || [];
  const dependents = [];

  for (const { model, field } of checks) {
    const Model = mongoose.model(model);
    const count = await Model.countDocuments({
      [field]: documentId
    });

    if (count > 0) {
      dependents.push({
        model,
        field,
        count,
        referenceType: 'hard' // Will be deleted
      });
    }
  }

  return {
    canDelete: true, // Always allows - cascade handler will clean up
    dependents
  };
}

module.exports = {
  deleteRestaurantCascade,
  deleteOrderCascade,
  deleteTableCascade,
  createCascadeDeleteHook,
  createCascadeDeleteManyHook,
  applyCascadeDeleteHook,
  checkDependencies,
  CASCADE_DELETE_CONFIG
};
