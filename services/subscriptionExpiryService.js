const Subscription = require('../models/Subscription');
const Customer = require('../models/Customer');
const Driver = require('../models/Driver');
const logger = require('../utils/logger');

let intervalRef = null;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // Every hour
const STALE_ORDER_MS = 30 * 60 * 1000; // Abandoned Razorpay orders expire after 30 min

/** Release one seat of capacity per expiring subscription on its assigned driver. */
async function releaseDriverCapacity(subscriptions) {
  const perDriver = new Map();
  for (const sub of subscriptions) {
    if (!sub.assignedDriverId) continue;
    const key = sub.assignedDriverId.toString();
    perDriver.set(key, (perDriver.get(key) || 0) + 1);
  }
  for (const [driverId, count] of perDriver) {
    await Driver.updateOne(
      { _id: driverId, activeSubscriptionCount: { $gte: count } },
      { $inc: { activeSubscriptionCount: -count } }
    );
  }
}

/**
 * Expire subscriptions whose endDate has passed, cancel abandoned payment
 * orders, and reset weekly booking counters. Terminal transitions ALWAYS clear
 * `isCurrent` (releasing the single-active slot) and free driver capacity.
 */
async function expireSubscriptions() {
  const now = new Date();

  try {
    // 1. Expire active subscriptions past their end date.
    const toExpire = await Subscription.find({
      status: 'ACTIVE',
      endDate: { $lte: now },
      isDeleted: false,
    }).select('_id customerId assignedDriverId').lean();

    if (toExpire.length > 0) {
      const ids = toExpire.map((s) => s._id);
      await Subscription.updateMany(
        { _id: { $in: ids } },
        { $set: { status: 'EXPIRED', isCurrent: false } }
      );
      await Customer.updateMany(
        { _id: { $in: toExpire.map((s) => s.customerId) }, isDeleted: false },
        { $unset: { subscriptionId: 1 } }
      );
      await releaseDriverCapacity(toExpire);
      logger.info(`[SubscriptionExpiry] Expired ${toExpire.length} subscriptions`);
    }

    // 2. Cancel abandoned PENDING_PAYMENT orders (releases the customer's slot).
    const staleDate = new Date(now.getTime() - STALE_ORDER_MS);
    const staleCancelled = await Subscription.updateMany(
      {
        status: 'PENDING_PAYMENT',
        createdAt: { $lte: staleDate },
        isDeleted: false,
      },
      { $set: { status: 'CANCELLED', isCurrent: false } }
    );
    if (staleCancelled.modifiedCount > 0) {
      logger.info(`[SubscriptionExpiry] Cancelled ${staleCancelled.modifiedCount} stale payment orders`);
    }

    // 3. Reset weekly booking counters every Monday.
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon
    if (dayOfWeek === 1) {
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
        { $set: { bookingsThisWeek: 0, weekResetDate: weekStart } }
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
