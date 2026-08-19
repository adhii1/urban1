const express = require('express');
const router = express.Router();
const customerController = require('../../controllers/customerController');
const subscriptionController = require('../../controllers/subscriptionController');
const ratingController = require('../../controllers/ratingController');
const authenticate = require('../../middleware/authMiddleware');
const authorize = require('../../middleware/roleMiddleware');
const validateRequest = require('../../middleware/validationMiddleware');
const subscriptionValidation = require('../../validations/subscriptionValidation');

router.use(authenticate);
router.use(authorize('Customer'));

router.get('/profile', customerController.getProfile);
router.put('/profile', customerController.updateProfile);
router.get('/trips', customerController.getTrips);
router.get('/trips/:id', customerController.getTripById);
router.get('/subscription', customerController.getSubscription);
router.post('/pause-request', customerController.requestPause);

// Subscription purchase flow
router.get('/plans', subscriptionController.browsePlans);
router.get('/plans/:id/routes', subscriptionController.getRoutesForPlan);
router.post(
  '/subscriptions/purchase',
  validateRequest(subscriptionValidation.purchaseSubscription, 'body', 'INVALID_SUBSCRIPTION_PURCHASE_REQUEST'),
  subscriptionController.initiatePurchase
);
router.post('/subscriptions/verify-payment', subscriptionController.verifySubscriptionPayment);
router.post('/subscriptions/cancel', subscriptionController.cancelSubscription);
router.get('/subscriptions/booking-eligibility', subscriptionController.checkBookingEligibility);

// Payment config (Razorpay key for frontend)
router.get('/payment-config', (req, res) => {
  const paymentService = require('../../services/paymentService');
  res.json({ success: true, data: { keyId: paymentService.getKeyId() } });
});

// Rating routes
router.post('/rides/:rideId/rate', ratingController.rateRide);
router.get('/ratings', ratingController.getCustomerRatings);

// Emergency Contacts
const featuresController = require('../../controllers/customerFeaturesController');
router.get('/emergency-contacts', featuresController.getEmergencyContacts);
router.post('/emergency-contacts', featuresController.addEmergencyContact);
router.put('/emergency-contacts/:id', featuresController.updateEmergencyContact);
router.delete('/emergency-contacts/:id', featuresController.deleteEmergencyContact);

// Settings
router.get('/settings', featuresController.getSettings);
router.put('/settings', featuresController.updateSettings);

// Dashboard (aggregate - simple profile + stats for now)
router.get('/dashboard', (req, res) => {
  res.json({ success: true, message: 'OK', data: {} });
});

module.exports = router;
