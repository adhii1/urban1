const express = require('express');
const router = express.Router();
const Joi = require('joi');
const rideController = require('../../controllers/rideController');
const authenticate = require('../../middleware/authMiddleware');
const authorize = require('../../middleware/roleMiddleware');
const validateRequest = require('../../middleware/validationMiddleware');

const cancelRideSchema = Joi.object({
  reason: Joi.string().trim().max(500).optional(),
});

router.use(authenticate);
router.use(authorize('Customer'));

router.get('/my', rideController.getMyRides);
router.get('/active', rideController.getActiveRide);
router.get('/:id', rideController.getRideById);
router.patch('/:id/cancel', validateRequest(cancelRideSchema), rideController.cancelRide);

module.exports = router;
