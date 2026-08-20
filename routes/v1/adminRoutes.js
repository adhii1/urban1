const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/adminController');
const documentController = require('../../controllers/documentController');
const authenticate = require('../../middleware/authMiddleware');
const authorize = require('../../middleware/roleMiddleware');
const validateRequest = require('../../middleware/validationMiddleware');
const adminValidation = require('../../validations/adminValidation');
const tripGenerationController = require('../../controllers/tripGenerationController');

router.use(authenticate);
router.use(authorize('Admin'));

// Dashboard
router.get('/dashboard', adminController.getDashboard);
router.get('/analytics', adminController.getAnalytics);

// Drivers
router.get('/drivers', adminController.getDrivers);
router.get('/drivers/:id', adminController.getDriverById);
router.post('/drivers', validateRequest(adminValidation.createDriver), adminController.createDriver);
router.patch('/drivers/:id', validateRequest(adminValidation.updateDriver), adminController.updateDriver);
router.delete('/drivers/:id', adminController.deleteDriver);

// Driver Document Verification
router.patch('/drivers/:driverId/documents/:type/verify', documentController.verifyDocument);
router.get('/drivers/:driverId/documents', documentController.getDocuments);

// Customers
router.get('/customers', adminController.getCustomers);
router.get('/customers/:id', adminController.getCustomerById);
router.post('/customers', validateRequest(adminValidation.createCustomer), adminController.createCustomer);
router.patch('/customers/:id', validateRequest(adminValidation.updateCustomer), adminController.updateCustomer);
router.delete('/customers/:id', adminController.deleteCustomer);
router.post('/customers/:id/ban', adminController.banCustomer);

// Trips
router.get('/trips', adminController.getTrips);
router.get('/trips/:id', adminController.getTripById);
router.post('/trips', validateRequest(adminValidation.createTrip), adminController.createTrip);
router.patch('/trips/:id', validateRequest(adminValidation.updateTrip), adminController.updateTrip);
router.delete('/trips/:id', adminController.deleteTrip);
router.post('/trips/:id/reassign', validateRequest(adminValidation.reassignTrip), adminController.reassignTrip);
// Bounded, authenticated recovery reruns for recurring-service generation.
router.post('/trips/generate', tripGenerationController.generateRecoveryTrips);

// Routes
router.get('/routes', adminController.getRoutes);
router.post('/routes', validateRequest(adminValidation.createRoute), adminController.createRoute);
router.patch('/routes/:id', validateRequest(adminValidation.updateRoute), adminController.updateRoute);
router.delete('/routes/:id', adminController.deleteRoute);

// Operational exceptions from trip generation and route reconciliation.
router.get('/operations/exceptions', adminController.getOperationalExceptions);
router.patch(
  '/operations/exceptions/:id/resolve',
  validateRequest(adminValidation.resolveOperationalException),
  adminController.resolveOperationalException
);

// Plans
router.get('/plans', adminController.getPlans);
router.post('/plans', validateRequest(adminValidation.createPlan), adminController.createPlan);
router.patch('/plans/:id', validateRequest(adminValidation.updatePlan), adminController.updatePlan);
router.delete('/plans/:id', adminController.deletePlan);

// Subscriptions
router.get('/subscriptions', adminController.getSubscriptions);
router.post('/subscriptions', validateRequest(adminValidation.createSubscription), adminController.createSubscription);
router.patch('/subscriptions/:id', validateRequest(adminValidation.updateSubscription), adminController.updateSubscription);
router.post('/subscriptions/:id/pause', validateRequest(adminValidation.pauseSubscription), adminController.pauseSubscription);
router.post('/subscriptions/:id/resume', validateRequest(adminValidation.resumeSubscription), adminController.resumeSubscription);
router.post('/subscriptions/:id/cancel', adminController.cancelSubscription);

// Settings
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);

// Admin Profile
router.get('/profile', adminController.getProfile);
router.put('/profile', adminController.updateProfile);

// Pause Requests
router.get('/pause-requests', adminController.getPauseRequests);
router.post('/pause-requests/:id/approve', adminController.approvePauseRequest);
router.post('/pause-requests/:id/reject', adminController.rejectPauseRequest);

// Areas
router.get('/areas', adminController.getAreas);
router.post('/areas', validateRequest(adminValidation.createArea), adminController.createArea);
router.patch('/areas/:id', validateRequest(adminValidation.updateArea), adminController.updateArea);
router.delete('/areas/:id', adminController.deleteArea);

// Subscription Matching (PDF section 20: Admin manual override)
const SubscriptionMatchingService = require('../../services/SubscriptionMatchingService');
const Subscription = require('../../models/Subscription');
const { generateTripsForDate } = require('../../services/DailyTripGenerator');

router.get('/subscriptions/unmatched', async (req, res) => {
  const unmatched = await Subscription.find({
    status: 'ACTIVE',
    assignedDriverId: null,
    isDeleted: false,
  }).populate('customerId', 'name').populate('planId', 'name tier');
  res.json({ success: true, data: unmatched });
});

router.post('/subscriptions/:id/match', async (req, res) => {
  const subscription = await Subscription.findById(req.params.id);
  if (!subscription) return res.status(404).json({ success: false, message: 'Subscription not found' });

  const result = await SubscriptionMatchingService.matchSubscription(subscription);
  if (result.success) {
    await SubscriptionMatchingService.assignDriverToSubscription(subscription._id, result.driver._id, result.area._id);
    return res.json({ success: true, message: 'Driver assigned', data: { driver: result.driver, area: result.area, candidates: result.allCandidates } });
  }
  res.json({ success: false, message: result.reason, data: { candidates: [] } });
});

router.post('/subscriptions/:id/assign-driver', async (req, res) => {
  const { driverId } = req.body;
  if (!driverId) return res.status(400).json({ success: false, message: 'driverId required' });
  const subscription = await Subscription.findById(req.params.id);
  if (!subscription) return res.status(404).json({ success: false, message: 'Subscription not found' });

  const Area = require('../../models/Area');
  const Driver = require('../../models/Driver');
  const driver = await Driver.findById(driverId);
  if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });

  await SubscriptionMatchingService.assignDriverToSubscription(subscription._id, driver._id, driver.areaId);
  res.json({ success: true, message: 'Driver manually assigned' });
});

router.post('/trips/generate', async (req, res) => {
  const { serviceDate } = req.body;
  const date = serviceDate ? new Date(serviceDate) : new Date();
  date.setDate(date.getDate() + (serviceDate ? 0 : 1));
  const result = await generateTripsForDate(date);
  res.json({ success: true, data: result });
});

// Live Rides (REST fallback for admin panel)
const RideRequest = require('../../models/RideRequest');
const Trip = require('../../models/Trip');
router.get('/rides', async (req, res) => {
  const { status } = req.query;
  
  // Get ride requests (on-demand rides)
  const rideFilter = { isDeleted: false };
  if (status && status !== 'ALL') {
    rideFilter.status = status;
  } else {
    rideFilter.status = { $in: ['SCHEDULED', 'PENDING', 'ACCEPTED', 'DRIVER_ARRIVING', 'IN_PROGRESS'] };
  }
  const rides = await RideRequest.find(rideFilter)
    .populate('acceptedDriverId', 'name vehicleNumber')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  // Get scheduled shuttle trips (today and upcoming)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tripFilter = { isDeleted: false, tripDate: { $gte: todayStart } };
  if (status && status !== 'ALL') {
    tripFilter.status = status;
  } else {
    tripFilter.status = { $in: ['SCHEDULED', 'IN_PROGRESS'] };
  }
  const trips = await Trip.find(tripFilter)
    .populate('routeId', 'name startLocation endLocation')
    .populate('driverId', 'name vehicleNumber')
    .populate('manifest.customer', 'name')
    .sort({ tripDate: -1 })
    .limit(50)
    .lean();

  // Convert trips to a ride-like format so frontend can show them together
  const tripAsRides = trips.map(t => ({
    _id: t._id,
    type: 'SHUTTLE',
    status: t.status,
    customerName: `${(t.manifest || []).length} passengers`,
    pickupLocation: { address: t.routeId?.startLocation || 'Route start' },
    dropLocation: { address: t.routeId?.endLocation || 'Route end' },
    acceptedDriverId: t.driverId,
    routeName: t.routeId?.name,
    tripDate: t.tripDate,
    manifest: t.manifest,
    passengerCount: (t.manifest || []).length,
    createdAt: t.createdAt,
    requestedAt: t.tripDate,
  }));

  const all = [...rides, ...tripAsRides].sort((a, b) => 
    new Date(b.createdAt || b.requestedAt).getTime() - new Date(a.createdAt || a.requestedAt).getTime()
  );

  res.json({ success: true, data: all });
});

module.exports = router;
