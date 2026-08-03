const express = require('express');
const router = express.Router();
const customerController = require('../../controllers/customerController');
const ratingController = require('../../controllers/ratingController');
const authenticate = require('../../middleware/authMiddleware');
const authorize = require('../../middleware/roleMiddleware');

router.use(authenticate);
router.use(authorize('Customer'));

router.get('/profile', customerController.getProfile);
router.put('/profile', customerController.updateProfile);
router.get('/trips', customerController.getTrips);
router.get('/trips/:id', customerController.getTripById);
router.get('/subscription', customerController.getSubscription);
router.post('/pause-request', customerController.requestPause);

// Rating routes
router.post('/rides/:rideId/rate', ratingController.rateRide);
router.get('/ratings', ratingController.getCustomerRatings);

module.exports = router;
