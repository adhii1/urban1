const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const customerRoutes = require('./customerRoutes');
const driverRoutes = require('./driverRoutes');
const adminRoutes = require('./adminRoutes');
const tripRoutes = require('./tripRoutes');
const rideRoutes = require('./rideRoutes');
const paymentRoutes = require('./paymentRoutes');

const database = require('../../config/database');
const config = require('../../config/config');
const formatResponse = require('../../utils/responseFormatter');

router.get('/health', (req, res) => {
  const dbStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  res.status(200).json({
    success: true,
    status: 'healthy',
    database: dbStates[database.connectionState()] || 'unknown',
    server: 'running',
    uptime: Math.floor(process.uptime()),
    version: '1.0.0',
    environment: config.env,
    timestamp: new Date().toISOString(),
  });
});

router.use('/auth', authRoutes);
router.use('/customer', customerRoutes);
router.use('/driver', driverRoutes);
router.use('/admin', adminRoutes);
router.use('/trips', tripRoutes);
router.use('/rides', rideRoutes);
router.use('/payments', paymentRoutes);

// --- Feature routes (auth required) ---
const authenticate = require('../../middleware/authMiddleware');
const authorize = require('../../middleware/roleMiddleware');
const featuresController = require('../../controllers/customerFeaturesController');

// Favourites
router.get('/favourites', authenticate, featuresController.getFavourites);
router.post('/favourites', authenticate, featuresController.addFavourite);
router.delete('/favourites/:id', authenticate, featuresController.deleteFavourite);

// Notifications
router.get('/notifications', authenticate, featuresController.getNotifications);
router.put('/notifications/read', authenticate, featuresController.markNotificationsRead);
router.delete('/notifications/:id', authenticate, featuresController.deleteNotification);

// Coupons
router.get('/coupons', authenticate, featuresController.getCoupons);
router.post('/coupons/apply', authenticate, featuresController.applyCoupon);

// Support
router.get('/support', authenticate, featuresController.getTickets);
router.post('/support', authenticate, featuresController.createTicket);
router.get('/support/:id', authenticate, featuresController.getTicketById);
router.post('/support/:id/reply', authenticate, featuresController.replyToTicket);

// Reviews (placeholder - actual review model exists separately)
router.get('/reviews', authenticate, (req, res) => res.json({ success: true, data: [] }));
router.post('/reviews', authenticate, (req, res) => res.json({ success: true, data: null }));

// Wallet
router.get('/wallet/rewards', authenticate, featuresController.getRewards);
router.get('/wallet/referrals', authenticate, featuresController.getReferrals);
router.get('/wallet/refunds', authenticate, featuresController.getRefunds);

// Bookings — subscription booking (Weekday / Hybrid / Shuttle). Customer-only.
const bookingController = require('../../controllers/bookingController');
router.post('/book', authenticate, authorize('Customer'), bookingController.createBooking);
router.get('/booking', authenticate, authorize('Customer'), bookingController.getMyBooking);
router.post('/booking/cancel', authenticate, authorize('Customer'), bookingController.cancelBooking);
router.put('/booking/location', authenticate, authorize('Customer'), bookingController.updateLocation);

// QR onboarding — customer fetches their signed boarding token (rendered as a QR).
const { getBoardingQrForCustomer } = require('../../services/qrOnboardingService');
router.get('/booking/boarding-qr', authenticate, authorize('Customer'), async (req, res) => {
  const result = await getBoardingQrForCustomer(req.user.id);
  if (!result.success) return res.status(404).json({ success: false, message: result.reason });
  res.json({ success: true, data: result });
});

// Wallet
router.get('/wallet', authenticate, authorize('Customer'), bookingController.getWallet);
router.post('/wallet/add', authenticate, authorize('Customer'), bookingController.addToWallet);

// Legacy bookings (route search for static frontend - uses existing Route model)
const Route = require('../../models/Route');
router.get('/bookings/routes', authenticate, async (req, res) => {
  const routes = await Route.find({ status: 'ACTIVE', isDeleted: false }).select('name startLocation endLocation stops');
  res.json({ success: true, data: routes });
});
router.get('/bookings/routes/:id', authenticate, async (req, res) => {
  const route = await Route.findById(req.params.id);
  res.json({ success: true, data: route });
});
router.get('/bookings', authenticate, (req, res) => res.json({ success: true, data: [] }));
router.get('/bookings/:id', authenticate, (req, res) => res.json({ success: true, data: null }));
router.post('/bookings', authenticate, (req, res) => res.json({ success: true, data: null }));

// Tracking
router.get('/tracking/:tripId', authenticate, (req, res) => res.json({ success: true, data: null }));
router.post('/tracking/customer-location', authenticate, (req, res) => res.json({ success: true, data: null }));

module.exports = router;
