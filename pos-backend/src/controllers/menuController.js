const MenuItem = require('../models/MenuItem');
const path = require('path');
const fs = require('fs').promises;

// @desc    Get all menu items
// @route   GET /api/menu
// @access  Private
exports.getMenuItems = async (req, res) => {
  try {
    const { category, isAvailable } = req.query;
    
    const filter = { restaurantId: req.user.restaurantId };
    
    if (category) filter.category = category;
    if (isAvailable !== undefined) filter.isAvailable = isAvailable === 'true';

    const menuItems = await MenuItem.find(filter).sort({ category: 1, name: 1 });

    res.status(200).json({
      success: true,
      count: menuItems.length,
      data: menuItems
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching menu items'
    });
  }
};

// @desc    Get single menu item
// @route   GET /api/menu/:id
// @access  Private
exports.getMenuItem = async (req, res) => {
  try {
    const menuItem = await MenuItem.findById(req.params.id);

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    res.status(200).json({
      success: true,
      data: menuItem
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching menu item'
    });
  }
};

// @desc    Create menu item
// @route   POST /api/menu
// @access  Private (Owner only)
exports.createMenuItem = async (req, res) => {
  try {
    const menuItem = await MenuItem.create({
      ...req.body,
      restaurantId: req.user.restaurantId
    });

    res.status(201).json({
      success: true,
      message: 'Menu item created successfully',
      data: menuItem
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating menu item'
    });
  }
};

// @desc    Update menu item
// @route   PUT /api/menu/:id
// @access  Private (Owner only)
exports.updateMenuItem = async (req, res) => {
  try {
    const menuItem = await MenuItem.findById(req.params.id);

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    const updatedMenuItem = await MenuItem.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    // Broadcast real-time menu update
    const realtime = req.app.locals.realtime;
    if (realtime) {
      realtime.notifyMenuUpdate(req.user.restaurantId, {
        action: 'UPDATE',
        item: updatedMenuItem,
        updatedBy: req.user.id,
        timestamp: new Date()
      });
    }

    res.status(200).json({
      success: true,
      message: 'Menu item updated successfully',
      data: updatedMenuItem
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating menu item'
    });
  }
};

// @desc    Delete menu item
// @route   DELETE /api/menu/:id
// @access  Private (Owner only)
exports.deleteMenuItem = async (req, res) => {
  try {
    const menuItem = await MenuItem.findById(req.params.id);

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    await MenuItem.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Menu item deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting menu item'
    });
  }
};

// @desc    Toggle menu item availability
// @route   PATCH /api/menu/:id/availability
// @access  Private
exports.toggleAvailability = async (req, res) => {
  try {
    const menuItem = await MenuItem.findById(req.params.id);

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    menuItem.isAvailable = !menuItem.isAvailable;
    await menuItem.save();

    // Broadcast real-time availability change
    const realtime = req.app.locals.realtime;
    if (realtime) {
      realtime.notifyMenuUpdate(req.user.restaurantId, {
        action: 'AVAILABILITY_TOGGLE',
        itemId: menuItem._id,
        itemName: menuItem.name,
        isAvailable: menuItem.isAvailable,
        updatedBy: req.user.id,
        timestamp: new Date()
      });
    }

    res.status(200).json({
      success: true,
      message: `Menu item ${menuItem.isAvailable ? 'enabled' : 'disabled'}`,
      data: menuItem
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error toggling availability'
    });
  }
};

// @desc    Upload menu item image
// @route   POST /api/menu/:id/upload-image
// @access  Private (Owner only)
exports.uploadMenuItemImage = async (req, res) => {
  try {
    if (!req.files || !req.files.image) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const menuItem = await MenuItem.findById(req.params.id);
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    const imageFile = req.files.image;
    const fileExt = path.extname(imageFile.name);
    const fileName = `menu-${req.params.id}-${Date.now()}${fileExt}`;
    const uploadPath = path.join(__dirname, '../../uploads/menu', fileName);

    // Create uploads directory if it doesn't exist
    await fs.mkdir(path.join(__dirname, '../../uploads/menu'), { recursive: true });

    // Delete old image if exists
    if (menuItem.image) {
      const oldImagePath = path.join(__dirname, '../../uploads/menu', path.basename(menuItem.image));
      try {
        await fs.unlink(oldImagePath);
      } catch (err) {
        // Ignore if old image doesn't exist
      }
    }

    // Move file
    await imageFile.mv(uploadPath);

    // Update menu item with image path
    menuItem.image = `/uploads/menu/${fileName}`;
    await menuItem.save();

    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      data: { image: menuItem.image }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error uploading image'
    });
  }
};
