/**
 * Data Integrity Utilities
 * Handles foreign key validation, referential integrity, and data consistency
 */

const mongoose = require('mongoose');

/**
 * Validates that a referenced document exists before creating/updating
 * @param {string} modelName - The model to reference (e.g., 'Restaurant', 'User')
 * @param {string|ObjectId} referenceId - The ID to validate
 * @param {object} options - Additional validation options
 * @returns {Promise<boolean>} - True if exists, throws NotFoundError if not
 */
async function validateReference(modelName, referenceId, options = {}) {
  if (!referenceId) {
    throw new Error(`${modelName} ID is required`);
  }

  // Validate ObjectId format
  if (!mongoose.Types.ObjectId.isValid(referenceId)) {
    throw new Error(`Invalid ${modelName} ID format`);
  }

  try {
    const model = mongoose.model(modelName);
    const document = await model.findById(referenceId).select('_id');

    if (!document) {
      const { NotFoundError } = require('./errors');
      throw new NotFoundError(`${modelName} not found`, {
        modelName,
        id: referenceId
      });
    }

    return true;
  } catch (error) {
    if (error.name === 'ModelNotFoundError') {
      throw new Error(`Model '${modelName}' not found in mongoose`);
    }
    throw error;
  }
}

/**
 * Validates all foreign keys in a document before saving
 * @param {object} document - The document to validate
 * @param {object} referenceMap - Map of field -> {model, required}
 * @returns {Promise<void>} - Throws if validation fails
 */
async function validateAllReferences(document, referenceMap) {
  const validations = [];

  for (const [fieldName, config] of Object.entries(referenceMap)) {
    const value = document[fieldName];

    if (!value && config.required) {
      throw new Error(`${fieldName} is required`);
    }

    if (value) {
      validations.push(
        validateReference(config.model, value)
          .catch(error => {
            throw new Error(`Invalid ${fieldName}: ${error.message}`);
          })
      );
    }
  }

  await Promise.all(validations);
}

/**
 * Checks for orphaned documents (documents with invalid foreign keys)
 * @param {string} modelName - Model to check
 * @param {object} foreignKeyMap - {fieldName: 'ReferencedModel'}
 * @returns {Promise<array>} - Array of orphaned documents
 */
async function findOrphanedDocuments(modelName, foreignKeyMap) {
  const model = mongoose.model(modelName);
  const orphans = [];

  // Get all documents
  const documents = await model.find().select('_id').lean();

  for (const doc of documents) {
    for (const [fieldName, referencedModel] of Object.entries(foreignKeyMap)) {
      const referencedId = doc[fieldName];

      if (referencedId) {
        const ReferencedModel = mongoose.model(referencedModel);
        const exists = await ReferencedModel.findById(referencedId).select('_id');

        if (!exists) {
          orphans.push({
            documentId: doc._id,
            brokenField: fieldName,
            brokenReference: referencedId,
            referencedModel
          });
        }
      }
    }
  }

  return orphans;
}

/**
 * Removes orphaned documents (documents with invalid foreign keys)
 * @param {string} modelName - Model to clean
 * @param {object} foreignKeyMap - {fieldName: 'ReferencedModel'}
 * @returns {Promise<number>} - Number of orphaned documents removed
 */
async function cleanOrphanedDocuments(modelName, foreignKeyMap) {
  const orphans = await findOrphanedDocuments(modelName, foreignKeyMap);
  const model = mongoose.model(modelName);

  for (const orphan of orphans) {
    await model.findByIdAndDelete(orphan.documentId);
  }

  return orphans.length;
}

/**
 * Generates database referential integrity report
 * @returns {Promise<object>} - Integrity status for all collections
 */
async function generateIntegrityReport() {
  const report = {
    timestamp: new Date(),
    collections: {},
    issues: []
  };

  // Define expected foreign key relationships
  const relationships = {
    User: { restaurantId: 'Restaurant' },
    MenuItem: { restaurantId: 'Restaurant' },
    Table: { restaurantId: 'Restaurant' },
    Order: { restaurantId: 'Restaurant', tableId: 'Table' },
    Bill: { restaurantId: 'Restaurant', orderId: 'Order' },
    Coupon: { restaurantId: 'Restaurant' },
    Reservation: { restaurantId: 'Restaurant', customerId: 'User' },
    Subscription: { restaurantId: 'Restaurant' }
  };

  for (const [modelName, foreignKeys] of Object.entries(relationships)) {
    try {
      const orphans = await findOrphanedDocuments(modelName, foreignKeys);
      report.collections[modelName] = {
        status: orphans.length === 0 ? 'healthy' : 'has_orphans',
        orphanCount: orphans.length,
        orphans: orphans.slice(0, 10) // First 10 for report
      };

      if (orphans.length > 0) {
        report.issues.push({
          collection: modelName,
          type: 'orphaned_documents',
          count: orphans.length,
          sample: orphans[0]
        });
      }
    } catch (error) {
      report.collections[modelName] = {
        status: 'error',
        error: error.message
      };
    }
  }

  return report;
}

/**
 * Database integrity check middleware for pre-save hooks
 * @param {object} referenceMap - {fieldName: {model: 'ModelName', required: true}}
 * @returns {function} - Mongoose pre-save hook function
 */
function createReferenceValidationHook(referenceMap) {
  return async function(next) {
    try {
      await validateAllReferences(this, referenceMap);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Validates and fixes common data integrity issues
 * @returns {Promise<object>} - Report of fixes applied
 */
async function autoRepairIntegrity() {
  const report = {
    timestamp: new Date(),
    actions: []
  };

  // Find and remove orphaned orders
  const Order = mongoose.model('Order');
  const Bill = mongoose.model('Bill');
  const orphanedOrders = await findOrphanedDocuments('Order', {
    restaurantId: 'Restaurant',
    tableId: 'Table'
  });

  if (orphanedOrders.length > 0) {
    // Don't delete orders - just log them
    report.actions.push({
      action: 'log_orphaned_orders',
      count: orphanedOrders.length,
      details: `Found ${orphanedOrders.length} orders with invalid references. Manual review recommended.`
    });
  }

  // Find orphaned bills and attempt cleanup
  const orphanedBills = await findOrphanedDocuments('Bill', {
    restaurantId: 'Restaurant',
    orderId: 'Order'
  });

  if (orphanedBills.length > 0) {
    // Bills without orders can be safely removed
    const removedCount = await cleanOrphanedDocuments('Bill', {
      orderId: 'Order'
    });
    report.actions.push({
      action: 'remove_orphaned_bills',
      count: removedCount
    });
  }

  return report;
}

/**
 * Creates index on foreign key field for better query performance
 * Prevents orphaned documents by enabling better lookups
 * @param {string} modelName - Model name
 * @param {string} fieldName - Foreign key field name
 * @returns {Promise<void>}
 */
async function ensureForeignKeyIndex(modelName, fieldName) {
  try {
    const model = mongoose.model(modelName);
    await model.collection.createIndex({ [fieldName]: 1 });
    return { success: true, message: `Index created on ${modelName}.${fieldName}` };
  } catch (error) {
    if (error.code === 85) {
      // Index already exists
      return { success: true, message: `Index already exists on ${modelName}.${fieldName}` };
    }
    throw error;
  }
}

/**
 * Ensures all foreign key indices are created
 * @returns {Promise<object>} - Report of index creation
 */
async function ensureAllForeignKeyIndices() {
  const indices = {
    User: ['restaurantId'],
    MenuItem: ['restaurantId'],
    Table: ['restaurantId'],
    Order: ['restaurantId', 'tableId'],
    Bill: ['restaurantId', 'orderId'],
    Coupon: ['restaurantId'],
    Reservation: ['restaurantId', 'customerId'],
    Subscription: ['restaurantId']
  };

  const report = {
    timestamp: new Date(),
    results: []
  };

  for (const [modelName, fields] of Object.entries(indices)) {
    for (const field of fields) {
      try {
        const result = await ensureForeignKeyIndex(modelName, field);
        report.results.push({
          model: modelName,
          field,
          ...result
        });
      } catch (error) {
        report.results.push({
          model: modelName,
          field,
          success: false,
          error: error.message
        });
      }
    }
  }

  return report;
}

module.exports = {
  validateReference,
  validateAllReferences,
  findOrphanedDocuments,
  cleanOrphanedDocuments,
  generateIntegrityReport,
  createReferenceValidationHook,
  autoRepairIntegrity,
  ensureForeignKeyIndex,
  ensureAllForeignKeyIndices
};
