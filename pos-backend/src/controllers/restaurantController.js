const Restaurant = require('../models/Restaurant');
const User = require('../models/User');

// @desc    Get restaurant details
// @route   GET /api/restaurants/:id
// @access  Private
exports.getRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    // Check if user belongs to this restaurant
    if (restaurant._id.toString() !== req.user.restaurantId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    res.status(200).json({
      success: true,
      data: restaurant
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching restaurant'
    });
  }
};

// @desc    Update restaurant details
// @route   PUT /api/restaurants/:id
// @access  Private (Owner only)
exports.updateRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    // Check authorization
    if (restaurant._id.toString() !== req.user.restaurantId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const updatedRestaurant = await Restaurant.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Restaurant updated successfully',
      data: updatedRestaurant
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating restaurant'
    });
  }
};

// @desc    Get staff members
// @route   GET /api/restaurants/:id/staff
// @access  Private (Owner only)
exports.getStaff = async (req, res) => {
  try {
    // Ensure scoped access to own restaurant only
    if (req.params.id.toString() !== req.user.restaurantId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access staff for this restaurant'
      });
    }
    const staff = await User.find({ 
      restaurantId: req.params.id 
    }).select('-password');

    res.status(200).json({
      success: true,
      count: staff.length,
      data: staff
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching staff'
    });
  }
};

// @desc    Add staff member
// @route   POST /api/restaurants/:id/staff
// @access  Private (Owner only)
exports.addStaff = async (req, res) => {
  try {
    // Ensure scoped access to own restaurant only
    if (req.params.id.toString() !== req.user.restaurantId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add staff for this restaurant'
      });
    }
    const { name, email, phone, password, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    const staff = await User.create({
      name,
      email,
      phone,
      password,
      role: role || 'CASHIER',
      restaurantId: req.params.id
    });

    res.status(201).json({
      success: true,
      message: 'Staff member added successfully',
      data: {
        id: staff._id,
        name: staff.name,
        email: staff.email,
        role: staff.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error adding staff'
    });
  }
};

// @desc    Update staff member
// @route   PUT /api/restaurants/:restaurantId/staff/:staffId
// @access  Private (Owner only)
exports.updateStaff = async (req, res) => {
  try {
    const staff = await User.findById(req.params.staffId);

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }

    // Ensure scoped access to own restaurant only
    if (
      req.params.restaurantId.toString() !== req.user.restaurantId.toString() ||
      staff.restaurantId.toString() !== req.user.restaurantId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this staff member'
      });
    }

    // Handle password hashing if password is being updated
    const updateData = { ...req.body };
    if (updateData.password) {
      // Use document save to trigger pre-save hook
      staff.set(updateData);
      await staff.save();
    } else {
      const updated = await User.findByIdAndUpdate(
        req.params.staffId,
        updateData,
        { new: true, runValidators: true }
      );
      if (!updated) {
        return res.status(404).json({
          success: false,
          message: 'Staff member not found after update'
        });
      }
      // Assign for response shape consistency
      staff.name = updated.name;
      staff.email = updated.email;
      staff.phone = updated.phone;
      staff.role = updated.role;
    }

    res.status(200).json({
      success: true,
      message: 'Staff member updated successfully',
      data: {
        _id: staff._id,
        name: staff.name,
        email: staff.email,
        phone: staff.phone,
        role: staff.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating staff'
    });
  }
};

// @desc    Delete staff member
// @route   DELETE /api/restaurants/:restaurantId/staff/:staffId
// @access  Private (Owner only)
exports.deleteStaff = async (req, res) => {
  try {
    const staff = await User.findById(req.params.staffId);

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }

    // Ensure scoped access to own restaurant only
    if (
      req.params.restaurantId.toString() !== req.user.restaurantId.toString() ||
      staff.restaurantId.toString() !== req.user.restaurantId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this staff member'
      });
    }

    await User.findByIdAndDelete(req.params.staffId);

    res.status(200).json({
      success: true,
      message: 'Staff member deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting staff'
    });
  }
};

// @desc    Upload restaurant logo
// @route   POST /api/restaurants/:id/upload-logo
// @access  Private (Owner only)
exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const restaurant = await Restaurant.findById(req.params.id);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    // Check authorization
    if (restaurant._id.toString() !== req.user.restaurantId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    // Convert image to base64
    const base64Image = req.file.buffer.toString('base64');
    const imageData = `data:${req.file.mimetype};base64,${base64Image}`;

    restaurant.logo = imageData;
    await restaurant.save();

    res.status(200).json({
      success: true,
      message: 'Logo uploaded successfully',
      data: {
        logo: restaurant.logo
      }
    });
  } catch (error) {
    console.error('Logo upload error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error uploading logo'
    });
  }
};
