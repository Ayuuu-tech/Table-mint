const express = require('express');
const router = express.Router();
const {
  createReservation,
  getReservations,
  getReservationById,
  updateReservation,
  updateReservationStatus,
  deleteReservation,
  getUpcomingReservations
} = require('../controllers/reservationController');
const { protect } = require('../middleware/auth');
const { checkActiveSubscription } = require('../middleware/subscriptionCheck');

router.use(protect);
router.use(checkActiveSubscription);

router.route('/')
  .get(getReservations)
  .post(createReservation);

router.get('/upcoming', getUpcomingReservations);

router.route('/:id')
  .get(getReservationById)
  .put(updateReservation)
  .delete(deleteReservation);

router.patch('/:id/status', updateReservationStatus);

module.exports = router;
