const User = require('../models/User');
const notificationService = require('../services/notificationService');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { ValidationError } = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Subscribe to push notifications
 * POST /api/v1/auth/notifications/subscribe
 */
const subscribePushNotification = asyncWrapper(async (req, res) => {
  const userId = req.user.id;
  const { subscription } = req.body;

  if (!subscription || !subscription.endpoint) {
    throw new ValidationError('Invalid push subscription');
  }

  // Store subscription in user profile
  await User.findByIdAndUpdate(userId, {
    $push: {
      'pushSubscriptions': {
        subscription,
        subscribedAt: new Date(),
        userAgent: req.headers['user-agent'],
      },
    },
  });

  logger.info(`Push subscription added for user ${userId}`);

  return res.status(200).json(
    formatResponse('Subscribed to push notifications', {
      subscribed: true,
    })
  );
});

/**
 * Unsubscribe from push notifications
 * POST /api/v1/auth/notifications/unsubscribe
 */
const unsubscribePushNotification = asyncWrapper(async (req, res) => {
  const userId = req.user.id;
  const { endpoint } = req.body;

  if (!endpoint) {
    throw new ValidationError('Subscription endpoint required');
  }

  // Remove subscription from user profile
  await User.findByIdAndUpdate(userId, {
    $pull: {
      'pushSubscriptions': {
        'subscription.endpoint': endpoint,
      },
    },
  });

  logger.info(`Push subscription removed for user ${userId}`);

  return res.status(200).json(
    formatResponse('Unsubscribed from push notifications', {
      unsubscribed: true,
    })
  );
});

/**
 * Get VAPID public key for client-side subscription
 * GET /api/v1/auth/notifications/vapid-public-key
 */
const getVapidPublicKey = asyncWrapper(async (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;

  if (!publicKey) {
    return res.status(200).json(
      formatResponse('VAPID public key not configured', {
        publicKey: null,
        enabled: false,
      })
    );
  }

  return res.status(200).json(
    formatResponse('VAPID public key retrieved', {
      publicKey,
      enabled: true,
    })
  );
});

/**
 * Send test notification to current user
 * POST /api/v1/auth/notifications/test
 */
const sendTestNotification = asyncWrapper(async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId).select('pushSubscriptions');

  if (!user || !user.pushSubscriptions || user.pushSubscriptions.length === 0) {
    throw new ValidationError('No push subscriptions found. Please subscribe first.');
  }

  const payload = {
    title: 'Test Notification',
    body: 'Push notifications are working correctly!',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    data: {
      url: '/',
      type: 'test',
    },
    tag: 'test-notification',
  };

  const results = await notificationService.sendBulkPushNotifications(
    user.pushSubscriptions.map((sub) => sub.subscription),
    payload
  );

  return res.status(200).json(
    formatResponse('Test notification sent', {
      results,
    })
  );
});

module.exports = {
  subscribePushNotification,
  unsubscribePushNotification,
  getVapidPublicKey,
  sendTestNotification,
};
