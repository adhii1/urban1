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
 * Move Customer.subscriptionId off subscriptions that just went terminal.
 *
 * Only customers actually pointing at one of them are touched, and each is
 * repointed at a surviving live subscription where one exists. Lazy require
 * keeps the load order between the two subscription services independent.
 */
async function repointExpiredCustomers(terminated) {
  const { repointPrimarySubscription } = require('./subscriptionService');
  for (const sub of terminated) {
    if (!sub.customerId) continue;
    const stillPointing = await Customer.exists({ _id: sub.customerId, subscriptionId: sub._id });
    if (!stillPointing) continue;
    await repointPrimarySubscription(sub.customerId, sub._id);
  }
}

/**
 * Expire subscriptions whose endDate has passed, cancel abandoned payment
 * orders, and reset weekly booking counters. Terminal transitions ALWAYS clear
 * `isCurrent` (freeing that pickup slot for a new subscription) and release
 * driver capacity.
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
      // Customers can hold several subscriptions, so the primary pointer is
      // moved to a surviving one rather than blanket-unset — unsetting it for
      // everyone would make customers whose *other* subscriptions are still
      // running look unsubscribed.
      await repointExpiredCustomers(toExpire);
      await releaseDriverCapacity(toExpire);
      logger.info(`[SubscriptionExpiry] Expired ${toExpire.length} subscriptions`);
    }

    // 2. Cancel abandoned PENDING_PAYMENT orders (frees their pickup slot).
    const staleDate = new Date(now.getTime() - STALE_ORDER_MS);
    const stale = await Subscription.find({
      status: 'PENDING_PAYMENT',
      createdAt: { $lte: staleDate },
      isDeleted: false,
    }).select('_id customerId').lean();
    if (stale.length > 0) {
      await Subscription.updateMany(
        { _id: { $in: stale.map((s) => s._id) } },
        { $set: { status: 'CANCELLED', isCurrent: false } }
      );
      await repointExpiredCustomers(stale);
      logger.info(`[SubscriptionExpiry] Cancelled ${stale.length} stale payment orders`);
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
