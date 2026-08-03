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

module.exports = router;
