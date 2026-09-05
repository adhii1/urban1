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
// Declared before '/trips/:id' so the literal path is not captured as an id.
router.put('/trips/status', driverController.updateTripStatus);
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

// NOTE: The previous /reset-all-offline, /reset-rides, and /reset-demo
// endpoints were removed. They performed destructive, system-wide mutations
// (Driver.updateMany({}), cancelling ALL subscriptions, expiring ALL rides)
// yet were reachable by ANY authenticated driver — a serious integrity/DoS
// risk. Database resets for local demos belong in a script
// (see seeds/dummyData.js), not a driver-facing HTTP route.

// Document upload routes
router.post('/documents/upload', upload.single('document'), documentController.uploadDocument);
router.get('/documents', documentController.getDocuments);

// Rating routes
router.get('/ratings/summary', ratingController.getDriverRatingSummary);
router.get('/ratings', ratingController.getDriverRatings);

// --- Trip Assignment (PDF section 10) ---
const { acceptTrip, rejectTrip } = require('../../services/TripAssignmentService');
const Trip = require('../../models/Trip');

// Get driver's assigned/upcoming trips
router.get('/assigned-trips', async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { toTripView } = require('../../utils/tripView');

  const trips = await Trip.find({
    driverId: driver._id,
    serviceDate: { $gte: today },
    isDeleted: false,
  })
    .populate({
      path: 'passengers.customerId',
      select: 'name userId',
      populate: { path: 'userId', select: 'phone' },
    })
    .populate({
      path: 'manifest.customer',
      select: 'name userId',
      populate: { path: 'userId', select: 'phone' },
    })
    .populate('routeId')
    .sort({ serviceDate: 1 })
    .lean();

  // Serialize through the same view as GET /driver/trips. Returning raw docs
  // here meant the manifest alias the driver screens read was absent, so every
  // rider rendered as an unnamed placeholder on this endpoint only.
  res.json({ success: true, data: trips.map((t) => toTripView(t, { viewer: 'driver' })) });
});

// Accept trip assignment
router.post('/trips/:id/accept', async (req, res) => {
  const result = await acceptTrip(req.params.id, req.user.id);
  if (!result.success) return res.status(400).json({ success: false, message: result.reason });
  res.json({ success: true, message: 'Trip accepted', data: result.trip });
});

// Reject trip assignment
router.post('/trips/:id/reject', async (req, res) => {
  const result = await rejectTrip(req.params.id, req.user.id);
  if (!result.success) return res.status(400).json({ success: false, message: result.reason });
  res.json({ success: true, message: result.reassigned ? 'Trip reassigned to another driver' : 'Trip rejected. Admin notified.', data: result });
});

// QR onboarding — driver scans a passenger's boarding QR to board them.
const { boardByScan } = require('../../services/qrOnboardingService');
router.post('/board/scan', async (req, res) => {
  const { token } = req.body;
  const result = await boardByScan(req.user.id, token);
  if (!result.success) return res.status(400).json({ success: false, message: result.reason });
  res.json({ success: true, message: result.alreadyBoarded ? 'Passenger already boarded' : 'Passenger boarded', data: result });
});

module.exports = router;
