const express = require('express');
const router = express.Router();
const paymentController = require('../../controllers/paymentController');
const authenticate = require('../../middleware/authMiddleware');
const authorize = require('../../middleware/roleMiddleware');

router.use(authenticate);
router.use(authorize('Customer'));

// Create payment order for a completed ride
router.post('/create-order', paymentController.createPaymentOrder);

// Verify payment after successful transaction
router.post('/verify', paymentController.verifyPayment);

// Process refund for a cancelled ride
router.post('/refund', paymentController.processRefund);

// Get payment status for a ride
router.get('/:rideId/status', paymentController.getPaymentStatus);

module.exports = router;
