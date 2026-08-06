const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/adminController');
const documentController = require('../../controllers/documentController');
const authenticate = require('../../middleware/authMiddleware');
const authorize = require('../../middleware/roleMiddleware');
const validateRequest = require('../../middleware/validationMiddleware');
const adminValidation = require('../../validations/adminValidation');

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

// Routes
router.get('/routes', adminController.getRoutes);
router.post('/routes', validateRequest(adminValidation.createRoute), adminController.createRoute);
router.patch('/routes/:id', validateRequest(adminValidation.updateRoute), adminController.updateRoute);
router.delete('/routes/:id', adminController.deleteRoute);

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

module.exports = router;
