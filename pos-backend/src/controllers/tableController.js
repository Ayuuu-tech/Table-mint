const Table = require('../models/Table');
const Order = require('../models/Order');

// @desc    Get all tables
// @route   GET /api/tables
// @access  Private
exports.getTables = async (req, res) => {
  try {
    const tables = await Table.find({ 
      restaurantId: req.user.restaurantId,
      isActive: true 
    })
    .populate('currentOrderId')
    .sort({ tableNumber: 1 });

    res.status(200).json({
      success: true,
      count: tables.length,
      data: tables
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching tables'
    });
  }
};

// @desc    Get single table
// @route   GET /api/tables/:id
// @access  Private
exports.getTable = async (req, res) => {
  try {
    const table = await Table.findById(req.params.id).populate('currentOrderId');

    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    res.status(200).json({
      success: true,
      data: table
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching table'
    });
  }
};

// @desc    Create table
// @route   POST /api/tables
// @access  Private (Owner only)
exports.createTable = async (req, res) => {
  try {
    const { tableNumber, capacity, section } = req.body;

    // Check if table number already exists
    const existingTable = await Table.findOne({
      restaurantId: req.user.restaurantId,
      tableNumber
    });

    if (existingTable) {
      return res.status(400).json({
        success: false,
        message: 'Table number already exists'
      });
    }

    const table = await Table.create({
      restaurantId: req.user.restaurantId,
      tableNumber,
      capacity,
      section
    });

    res.status(201).json({
      success: true,
      message: 'Table created successfully',
      data: table
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating table'
    });
  }
};

// @desc    Update table
// @route   PUT /api/tables/:id
// @access  Private (Owner only)
exports.updateTable = async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);

    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    const updatedTable = await Table.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Table updated successfully',
      data: updatedTable
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating table'
    });
  }
};

// @desc    Delete table
// @route   DELETE /api/tables/:id
// @access  Private (Owner only)
exports.deleteTable = async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);

    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    // Check if table has active order
    if (table.status === 'OCCUPIED' && table.currentOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete table with active order'
      });
    }

    // Soft delete
    table.isActive = false;
    await table.save();

    res.status(200).json({
      success: true,
      message: 'Table deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting table'
    });
  }
};

// @desc    Get table current order
// @route   GET /api/tables/:id/order
// @access  Private
exports.getTableOrder = async (req, res) => {
  try {
    const table = await Table.findById(req.params.id).populate('currentOrderId');

    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    if (!table.currentOrderId) {
      return res.status(404).json({
        success: false,
        message: 'No active order for this table'
      });
    }

    const order = await Order.findById(table.currentOrderId).populate('items.menuItemId');

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching table order'
    });
  }
};
