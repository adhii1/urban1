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

// --- Stub routes (static frontend expects these) ---
const authenticate = require('../../middleware/authMiddleware');
const emptyList = (req, res) => res.json({ success: true, message: 'OK', data: [] });
const stubOk = (req, res) => res.json({ success: true, message: 'OK', data: null });

router.get('/favourites', authenticate, emptyList);
router.post('/favourites', authenticate, stubOk);
router.delete('/favourites/:id', authenticate, stubOk);
router.get('/notifications', authenticate, emptyList);
router.put('/notifications/read', authenticate, stubOk);
router.delete('/notifications/:id', authenticate, stubOk);
router.get('/coupons', authenticate, emptyList);
router.post('/coupons/apply', authenticate, stubOk);
router.get('/support', authenticate, emptyList);
router.post('/support', authenticate, stubOk);
router.get('/support/:id', authenticate, stubOk);
router.post('/support/:id/reply', authenticate, stubOk);
router.get('/reviews', authenticate, emptyList);
router.post('/reviews', authenticate, stubOk);
router.get('/wallet/rewards', authenticate, emptyList);
router.get('/wallet/referrals', authenticate, emptyList);
router.get('/wallet/refunds', authenticate, emptyList);
router.get('/bookings/routes', authenticate, emptyList);
router.get('/bookings/routes/:id', authenticate, stubOk);
router.get('/bookings', authenticate, emptyList);
router.get('/bookings/:id', authenticate, stubOk);
router.post('/bookings', authenticate, stubOk);
router.get('/tracking/:tripId', authenticate, stubOk);
router.post('/tracking/customer-location', authenticate, stubOk);

module.exports = router;
