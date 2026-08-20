const express = require('express');
const router = express.Router();

const authController = require('../../controllers/authController');
const notificationController = require('../../controllers/notificationController');
const validateRequest = require('../../middleware/validationMiddleware');
const authValidation = require('../../validations/authValidation');
const authenticate = require('../../middleware/authMiddleware');
const { authLimiter, otpLimiter, passwordResetLimiter } = require('../../middleware/rateLimiterMiddleware');

// Authentication
router.post(
  '/login',
  authLimiter,
  validateRequest(authValidation.login),
  authController.login
);

router.post(
  '/admin/login',
  authLimiter,
  validateRequest(authValidation.adminLogin),
  authController.adminLogin
);

// Driver Self-Registration — DISABLED per PDF section 3:
// "The driver should not have a public signup. Admin creates the driver."
// Endpoint retained but returns 403 to prevent breaking existing clients.
router.post(
  '/driver/register',
  authLimiter,
  (req, res) => res.status(403).json({ success: false, message: 'Driver registration is admin-only. Contact your administrator.' })
);

// OTP Endpoints
router.post(
  '/send-otp',
  otpLimiter,
  validateRequest(authValidation.sendOtp),
  authController.sendOtp
);

router.post(
  '/verify-otp',
  otpLimiter,
  validateRequest(authValidation.verifyOtp),
  authController.verifyOtp
);

// Password Recovery
router.post(
  '/forgot-password',
  passwordResetLimiter,
  validateRequest(authValidation.forgotPassword),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  passwordResetLimiter,
  validateRequest(authValidation.resetPassword),
  authController.resetPassword
);

// Token Refresh & Session
router.post('/refresh', authController.refresh);
router.post('/logout', authenticate, authController.logout);

// Protected Profile Endpoints
router.get('/me', authenticate, authController.getMe);

router.put(
  '/profile',
  authenticate,
  validateRequest(authValidation.updateProfile),
  authController.updateProfile
);

router.put(
  '/change-password',
  authenticate,
  validateRequest(authValidation.changePassword),
  authController.changePassword
);

router.post(
  '/set-password',
  authenticate,
  validateRequest(authValidation.setPassword),
  authController.setPassword
);

// Push Notification Endpoints
router.get(
  '/notifications/vapid-public-key',
  notificationController.getVapidPublicKey
);

router.post(
  '/notifications/subscribe',
  authenticate,
  notificationController.subscribePushNotification
);

router.post(
  '/notifications/unsubscribe',
  authenticate,
  notificationController.unsubscribePushNotification
);

router.post(
  '/notifications/test',
  authenticate,
  notificationController.sendTestNotification
);

module.exports = router;
