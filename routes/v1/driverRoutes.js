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

// Reset all drivers offline (admin helper for demo)
router.post('/reset-all-offline', async (req, res) => {
  const result = await Driver.updateMany({}, { isOnline: false, isAvailable: false });
  res.json({ success: true, message: `${result.modifiedCount} drivers set offline` });
});

// Reset all stale rides (demo helper)
const RideRequest = require('../../models/RideRequest');
router.post('/reset-rides', async (req, res) => {
  const result = await RideRequest.updateMany(
    { status: { $in: ['PENDING', 'SCHEDULED'] } },
    { $set: { status: 'EXPIRED', isBundled: false, ttlAt: new Date() } }
  );
  res.json({ success: true, message: `${result.modifiedCount} rides cleared` });
});

// One-stop demo reset endpoint
const Subscription = require('../../models/Subscription');
const Customer = require('../../models/Customer');
router.post('/reset-demo', async (req, res) => {
  try {
    // 1. Set all drivers offline
    const driversResult = await Driver.updateMany({}, { isOnline: false, isAvailable: false });

    // 2. Clear all stale/pending rides
    const ridesResult = await RideRequest.updateMany(
      { status: { $in: ['PENDING', 'SCHEDULED', 'DRIVER_ASSIGNED'] } },
      { $set: { status: 'EXPIRED', isBundled: false, ttlAt: new Date() } }
    );

    // 3. Cancel any PENDING_PAYMENT subscriptions (stale orders)
    const pendingSubsResult = await Subscription.updateMany(
      { status: 'PENDING_PAYMENT' },
      { $set: { status: 'CANCELLED', 'payment.status': 'failed' } }
    );

    // 4. Cancel ALL active subscriptions so customer can re-purchase for demo
    const activeSubsResult = await Subscription.updateMany(
      { status: { $in: ['ACTIVE', 'PAUSED'] } },
      { $set: { status: 'CANCELLED' } }
    );

    // 5. Unlink subscriptions from customers
    await Customer.updateMany(
      { subscriptionId: { $exists: true } },
      { $unset: { subscriptionId: 1 } }
    );

    res.json({
      success: true,
      message: 'Demo reset complete',
      data: {
        driversOffline: driversResult.modifiedCount,
        ridesCleared: ridesResult.modifiedCount,
        pendingSubsCancelled: pendingSubsResult.modifiedCount,
        activeSubsCancelled: activeSubsResult.modifiedCount,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

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
