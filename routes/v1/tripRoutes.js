const express = require('express');
const router = express.Router();
const tripController = require('../../controllers/tripController');
const authenticate = require('../../middleware/authMiddleware');
const authorize = require('../../middleware/roleMiddleware');

router.use(authenticate);
router.use(authorize('Admin'));

router.get('/', tripController.getTrips);
router.get('/:id', tripController.getTripById);

module.exports = router;
