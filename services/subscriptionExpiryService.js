const Subscription = require('../models/Subscription');
const Customer = require('../models/Customer');
const logger = require('../utils/logger');

let intervalRef = null;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // Every hour

/**
 * Expire subscriptions whose endDate has passed.
 * Also resets weekly booking counters every Monday.
 */
async function expireSubscriptions() {
  const now = new Date();

  try {
    // 1. Expire active subscriptions past their end date
    const expired = await Subscription.updateMany(
      {
        status: 'ACTIVE',
        endDate: { $lte: now },
        isDeleted: false,
      },
      {
        $set: { status: 'EXPIRED' },
      }
    );

    if (expired.modifiedCount > 0) {
      logger.info(`[SubscriptionExpiry] Expired ${expired.modifiedCount} subscriptions`);

      // Clear subscriptionId from customers whose subscriptions expired
      const expiredSubs = await Subscription.find({
        status: 'EXPIRED',
        endDate: { $lte: now },
        isDeleted: false,
      }).select('customerId');

      const customerIds = expiredSubs.map((s) => s.customerId);
      if (customerIds.length > 0) {
        await Customer.updateMany(
          { _id: { $in: customerIds }, isDeleted: false },
          { $unset: { subscriptionId: 1 } }
        );
      }
    }

    // 2. Expire PENDING_PAYMENT subscriptions older than 24 hours (stale orders)
    const staleDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const staleCancelled = await Subscription.updateMany(
      {
        status: 'PENDING_PAYMENT',
        createdAt: { $lte: staleDate },
        isDeleted: false,
      },
      {
        $set: { status: 'CANCELLED' },
      }
    );

    if (staleCancelled.modifiedCount > 0) {
      logger.info(`[SubscriptionExpiry] Cancelled ${staleCancelled.modifiedCount} stale payment subscriptions`);
    }

    // 3. Reset weekly booking counters every Monday
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon
    if (dayOfWeek === 1) {
      // Monday - reset if not already reset this week
      const weekStart = new Date(now);
      weekStart.setHours(0, 0, 0, 0);

      await Subscription.updateMany(
        {
          status: 'ACTIVE',
          isDeleted: false,
          $or: [
            { weekResetDate: { $lt: weekStart } },
            { weekResetDate: { $exists: false } },
          ],
        },
        {
          $set: { bookingsThisWeek: 0, weekResetDate: weekStart },
        }
      );
    }
  } catch (err) {
    logger.error('[SubscriptionExpiry] Error during expiry check', { error: err.message });
  }
}

function start() {
  if (intervalRef) return;
  logger.info('[SubscriptionExpiry] Starting subscription expiry service');
  // Run immediately on start
  expireSubscriptions();
  intervalRef = setInterval(expireSubscriptions, CHECK_INTERVAL_MS);
}

function stop() {
  if (intervalRef) {
    clearInterval(intervalRef);
    intervalRef = null;
    logger.info('[SubscriptionExpiry] Stopped subscription expiry service');
  }
}

module.exports = { start, stop, expireSubscriptions };
