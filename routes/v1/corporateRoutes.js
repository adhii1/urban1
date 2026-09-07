const express = require('express');
const router = express.Router();
const corporateController = require('../../controllers/corporateController');
const authenticate = require('../../middleware/authMiddleware');
const authorize = require('../../middleware/roleMiddleware');
const validateRequest = require('../../middleware/validationMiddleware');
const corporateValidation = require('../../validations/corporateValidation');

router.use(authenticate);
router.use(authorize('Corporate'));

router.get('/dashboard', corporateController.getDashboard);

router.get('/profile', corporateController.getProfile);
router.put('/profile', validateRequest(corporateValidation.updateProfile), corporateController.updateProfile);

router.get('/employees', corporateController.getEmployees);
router.post('/employees', validateRequest(corporateValidation.addEmployee), corporateController.addEmployee);
router.delete('/employees/:id', corporateController.removeEmployee);

module.exports = router;
