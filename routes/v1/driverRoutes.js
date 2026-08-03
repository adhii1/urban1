const express = require('express');
const router = express.Router();
const driverController = require('../../controllers/driverController');
const documentController = require('../../controllers/documentController');
const ratingController = require('../../controllers/ratingController');
const authenticate = require('../../middleware/authMiddleware');
const authorize = require('../../middleware/roleMiddleware');
const upload = require('../../middleware/uploadMiddleware');

router.use(authenticate);
router.use(authorize('Driver'));

router.get('/profile', driverController.getProfile);
router.get('/trips', driverController.getTrips);
router.get('/earnings', driverController.getEarnings);
router.get('/trips/:id', driverController.getTripById);
router.get('/trips/:id/customers', driverController.getTripCustomers);
router.patch('/trips/:id/start', driverController.startTrip);
router.patch('/trips/:id/complete', driverController.completeTrip);
router.patch('/trips/:id/manifest/:customerId/:action', driverController.updateManifestStatus);

// Document upload routes
router.post('/documents/upload', upload.single('document'), documentController.uploadDocument);
router.get('/documents', documentController.getDocuments);

// Rating routes
router.get('/ratings/summary', ratingController.getDriverRatingSummary);
router.get('/ratings', ratingController.getDriverRatings);

module.exports = router;
