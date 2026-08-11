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

// Duty status toggle (REST endpoint for static frontend)
const Driver = require('../../models/Driver');
router.put('/duty', async (req, res) => {
  const { dutyStatus, available } = req.body;
  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });
  
  const isOnline = dutyStatus === 'ONLINE';
  driver.isOnline = isOnline;
  driver.isAvailable = isOnline && available !== false;
  await driver.save();
  
  res.json({ success: true, message: `Driver is now ${isOnline ? 'online' : 'offline'}`, data: { isOnline, isAvailable: driver.isAvailable } });
});

// Reset all drivers offline (admin helper for demo)
router.post('/reset-all-offline', async (req, res) => {
  const result = await Driver.updateMany({}, { isOnline: false, isAvailable: false });
  res.json({ success: true, message: `${result.modifiedCount} drivers set offline` });
});

// Document upload routes
router.post('/documents/upload', upload.single('document'), documentController.uploadDocument);
router.get('/documents', documentController.getDocuments);

// Rating routes
router.get('/ratings/summary', ratingController.getDriverRatingSummary);
router.get('/ratings', ratingController.getDriverRatings);

module.exports = router;
