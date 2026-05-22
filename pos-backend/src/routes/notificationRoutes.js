const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

router.use(protect);

// Get notifications
router.get('/', notificationController.getNotifications);

// Create notification
router.post('/', notificationController.createNotification);

// Mark notification as read
router.patch('/:notificationId/read', notificationController.markAsRead);

// Mark all as read
router.post('/mark-all-read', notificationController.markAllAsRead);

// Delete notification
router.delete('/:notificationId', notificationController.deleteNotification);

module.exports = router;
