/**
 * Notification Service
 * Handles push notifications via Firebase Cloud Messaging (FCM) or Web Push API
 * 
 * SETUP:
 * 1. For FCM: Get service account key from Firebase Console
 * 2. Set GOOGLE_APPLICATION_CREDENTIALS in .env file
 * 3. Or use Web Push API with VAPID keys
 * 
 * CURRENT STATUS: Basic implementation with Web Push API
 * TODO: Integrate Firebase Cloud Messaging for mobile apps
 */

const webpush = require('web-push');
const logger = require('../utils/logger');

class NotificationService {
  constructor() {
    this.vapidKeys = null;
    this.initialized = false;

    // Initialize VAPID keys for Web Push
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:notifications@urban-commuto.com';

    if (vapidPublicKey && vapidPrivateKey) {
      this.vapidKeys = {
        publicKey: vapidPublicKey,
        privateKey: vapidPrivateKey,
      };
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
      this.initialized = true;
      logger.info('Notification service initialized with Web Push');
    } else {
      logger.warn('VAPID keys not configured. Push notifications disabled.');
      logger.warn('Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env');
    }
  }

  /**
   * Generate VAPID keys for Web Push (one-time setup)
   */
  generateVapidKeys() {
    const keys = webpush.generateVAPIDKeys();
    logger.info('Generated VAPID keys:', {
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
    });
    logger.info('Add these to your .env file:');
    logger.info(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
    logger.info(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
    return keys;
  }

  /**
   * Send push notification to a single subscription
   * @param {Object} subscription - Push subscription object
   * @param {Object} payload - Notification payload
   */
  async sendPushNotification(subscription, payload) {
    if (!this.initialized) {
      logger.warn('Notification service not initialized');
      return { success: false, error: 'Service not initialized' };
    }

    try {
      const result = await webpush.sendNotification(
        subscription,
        JSON.stringify(payload)
      );
      logger.info('Push notification sent successfully');
      return { success: true, result };
    } catch (error) {
      if (error.statusCode === 410 || error.statusCode === 404) {
        // Subscription expired or invalid - should be removed from database
        logger.warn('Push subscription expired or invalid', { statusCode: error.statusCode });
        return { success: false, expired: true, error: error.message };
      }
      logger.error('Failed to send push notification', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send push notification to multiple subscriptions
   * @param {Array} subscriptions - Array of push subscription objects
   * @param {Object} payload - Notification payload
   */
  async sendBulkPushNotifications(subscriptions, payload) {
    if (!this.initialized) {
      logger.warn('Notification service not initialized');
      return { success: false, error: 'Service not initialized' };
    }

    const results = await Promise.allSettled(
      subscriptions.map((sub) => this.sendPushNotification(sub, payload))
    );

    const successful = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;

    return {
      success: true,
      total: subscriptions.length,
      successful,
      failed,
      results,
    };
  }

  /**
   * Create notification payload for ride updates
   */
  createRideNotification(rideUpdate) {
    const { type, rideId, message, etaMinutes, fare } = rideUpdate;

    const titles = {
      ride_accepted: 'Driver Assigned!',
      ride_arriving: 'Driver Arriving',
      ride_started: 'Ride Started',
      ride_completed: 'Ride Completed',
      ride_cancelled: 'Ride Cancelled',
      new_ride_request: 'New Ride Request',
    };

    return {
      title: titles[type] || 'Ride Update',
      body: message,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: {
        url: `/ride/${rideId}`,
        type,
        rideId,
      },
      tag: `ride-${rideId}`,
      renotify: true,
    };
  }

  /**
   * Create notification payload for payment updates
   */
  createPaymentNotification(paymentUpdate) {
    const { type, rideId, amount, message } = paymentUpdate;

    return {
      title: type === 'refund' ? 'Refund Processed' : 'Payment Received',
      body: message || `₹${amount} - Ride #${rideId}`,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: {
        url: `/payments/${rideId}`,
        type,
        rideId,
      },
      tag: `payment-${rideId}`,
      renotify: true,
    };
  }
}

module.exports = new NotificationService();
