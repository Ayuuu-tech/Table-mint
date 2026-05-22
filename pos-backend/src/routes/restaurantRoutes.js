const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  getRestaurant,
  updateRestaurant,
  getStaff,
  addStaff,
  updateStaff,
  deleteStaff,
  uploadLogo
} = require('../controllers/restaurantController');
const { protect, authorize } = require('../middleware/auth');

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

router.get('/:id', protect, getRestaurant);
router.put('/:id', protect, authorize('OWNER'), updateRestaurant);
router.post('/:id/upload-logo', protect, authorize('OWNER'), upload.single('logo'), uploadLogo);

// Staff management
router.get('/:id/staff', protect, authorize('OWNER'), getStaff);
router.post('/:id/staff', protect, authorize('OWNER'), addStaff);
router.put('/:restaurantId/staff/:staffId', protect, authorize('OWNER'), updateStaff);
router.delete('/:restaurantId/staff/:staffId', protect, authorize('OWNER'), deleteStaff);

module.exports = router;
