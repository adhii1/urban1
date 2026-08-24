/**
 * subscriptionService — the single source of truth for subscription lifecycle.
 *
 * Both HTTP entry points (bookingController `/book` and subscriptionController
 * `/subscriptions/*`) and the admin create path call into this service. It owns:
 *   - plan resolution (by subscriptionType/tier — never fabricated)
 *   - the single-active-subscription invariant (atomic, via the isCurrent index)
 *   - the payment state machine (wallet | razorpay | instant)
 *   - matching + (out-of-request) trip scheduling
 *   - cancellation + future-trip reconciliation
 *
 * Canonical model is coordinate/area based (GeoJSON pickup/drop + scheduleDays),
 * matching the Trip model (`passengers[]` + `serviceDate`) and DailyTripGenerator.
 */

const Customer = require('../models/Customer');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const Trip = require('../models/Trip');
const Driver = require('../models/Driver');
const {
  matchSubscription,
  assignDriverToSubscription,
} = require('./SubscriptionMatchingService');
const { offerTripToDriver } = require('./TripAssignmentService');
const paymentService = require('./paymentService');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/AppError');
const logger = require('../utils/logger');

// subscriptionType -> Plan.tier. SHUTTLE maps to the Standard tier.
const TYPE_TO_TIER = Object.freeze({
  WEEKDAYS: 'Weekday',
  HYBRID: 'Hybrid',
  SHUTTLE: 'Standard',
});

// Statuses that occupy a customer's single "current subscription" slot.
const CURRENT_STATUSES = Object.freeze(['ACTIVE', 'PAUSED', 'PENDING_PAYMENT']);
const PAYMENT_METHODS = Object.freeze(['wallet', 'razorpay', 'instant']);
const DEFAULT_DURATION_DAYS = 30;

// ---------------------------------------------------------------------------
// Validation & normalization helpers
// ---------------------------------------------------------------------------

function validateCoordinates(location, label) {
  const coords = location?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2 || !coords.every((n) => Number.isFinite(n))) {
    throw new ValidationError(`${label} location with [longitude, latitude] coordinates is required.`, {
      code: `INVALID_${label.toUpperCase()}_LOCATION`,
    });
  }
}

/**
 * Resolve schedule days from the subscription type.
 * WEEKDAYS/SHUTTLE => Mon–Fri. HYBRID => 1–3 distinct customer-picked days (Mon–Sat).
 */
function normalizeScheduleDays(subscriptionType, scheduleDays) {
  if (subscriptionType === 'WEEKDAYS' || subscriptionType === 'SHUTTLE') {
    return [1, 2, 3, 4, 5];
  }
  // HYBRID
  if (!Array.isArray(scheduleDays) || scheduleDays.length === 0) {
    throw new ValidationError('For HYBRID, select 1–3 commute days per week.', { code: 'HYBRID_DAYS_REQUIRED' });
  }
  const normalized = [...new Set(scheduleDays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 6))]
    .sort((a, b) => a - b)
    .slice(0, 3);
  if (normalized.length === 0) {
    throw new ValidationError('Invalid schedule days. Use 1=Mon through 6=Sat.', { code: 'INVALID_HYBRID_DAYS' });
  }
  return normalized;
}

/** Floor to local midnight; clamp a past start to today (don't fail the booking). */
function normalizeStartDate(startDate) {
  const start = new Date(startDate || Date.now());
  if (Number.isNaN(start.getTime())) {
    throw new ValidationError('A valid start date is required.', { code: 'INVALID_START_DATE' });
  }
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start < today) start.setTime(today.getTime());
  return start;
}

/** Format a Date as its LOCAL calendar date (YYYY-MM-DD). */
function toLocalISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The next `count` calendar dates (local YYYY-MM-DD) that fall on a schedule day. */
function upcomingServiceDates(scheduleDays, start, count = 7) {
  const dates = [];
  for (let i = 0; i < 30 && dates.length < count; i++) {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    if (scheduleDays.includes(day.getDay())) dates.push(toLocalISODate(day));
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

/**
 * Resolve the active Plan for a subscription type. Throws (never fabricates) so
 * a misconfigured catalog surfaces loudly instead of creating planId:undefined
 * subscriptions that break every downstream read.
 */
async function resolvePlanForType(subscriptionType) {
  const tier = TYPE_TO_TIER[subscriptionType];
  if (!tier) {
    throw new ValidationError(
      'Subscription type must be WEEKDAYS, HYBRID, or SHUTTLE. Use "Book Ride" for on-demand Flexy rides.',
      { code: 'INVALID_SUBSCRIPTION_TYPE' }
    );
  }
  const plan = await Plan.findOne({ tier, isActive: true, isDeleted: false });
  if (!plan) {
    throw new ValidationError(
      `No active ${subscriptionType} plan is configured. Please contact support.`,
      { code: 'PLAN_NOT_CONFIGURED' }
    );
  }
  return plan;
}

/** Friendly pre-check; the partial unique index is the real atomic guard. */
async function assertNoCurrentSubscription(customerId) {
  const existing = await Subscription.findOne({ customerId, isCurrent: true, isDeleted: false })
    .select('_id subscriptionType status')
    .lean();
  if (existing) {
    throw new ConflictError('You already have an active subscription. Cancel it before creating a new one.');
  }
}

/** Release a subscription's "current" slot and mark a terminal/failed status. */
async function releaseSubscription(subscription, status) {
  subscription.status = status;
  subscription.isCurrent = false;
  await subscription.save();
  return subscription;
}

/**
 * Create a subscription. Reserves the single-active slot atomically (as
 * PENDING_PAYMENT, or ACTIVE for instant), then runs the payment state machine.
 *
 * Returns { subscription, plan, requiresPayment, order?, match?, scheduledDates }.
 */
async function createSubscription({
  userId,
  subscriptionType,
  pickupLocation,
  dropLocation,
  scheduleDays,
  pickupTime,
  startDate,
  paymentMethod = 'wallet',
}) {
  const customer = await Customer.findOne({ userId });
  if (!customer) throw new NotFoundError('Customer');

  validateCoordinates(pickupLocation, 'Pickup');
  validateCoordinates(dropLocation, 'Drop');
  if (!pickupTime) throw new ValidationError('Pickup time is required (e.g. "08:00").', { code: 'PICKUP_TIME_REQUIRED' });

  const normalizedDays = normalizeScheduleDays(subscriptionType, scheduleDays);
  const plan = await resolvePlanForType(subscriptionType);
  const method = PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : 'wallet';

  await assertNoCurrentSubscription(customer._id);

  const start = normalizeStartDate(startDate);
  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + (plan.durationDays || DEFAULT_DURATION_DAYS));

  // Reserve the slot. The partial unique index on { customerId, isCurrent:true }
  // makes this the authoritative concurrency guard against double-booking.
  let subscription;
  try {
    subscription = await Subscription.create({
      customerId: customer._id,
      planId: plan._id,
      subscriptionType,
      scheduleDays: normalizedDays,
      selectedWeekdays: normalizedDays, // read-alias for legacy readers during transition
      pickupLocation: { address: pickupLocation.address || '', type: 'Point', coordinates: pickupLocation.coordinates },
      dropLocation: { address: dropLocation.address || '', type: 'Point', coordinates: dropLocation.coordinates },
      pickupTime,
      startDate: start,
      endDate,
      remainingPauseDays: plan.pauseDaysAllowed || 0,
      status: method === 'instant' ? 'ACTIVE' : 'PENDING_PAYMENT',
      isCurrent: true,
      payment: {
        method,
        amount: plan.price,
        status: method === 'instant' ? 'completed' : 'pending',
        paidAt: method === 'instant' ? new Date() : undefined,
      },
    });
  } catch (err) {
    if (err && err.code === 11000) {
      throw new ConflictError('You already have an active subscription. Cancel it before creating a new one.');
    }
    throw err;
  }

  // --- Payment state machine ---
  if (method === 'razorpay') {
    const order = await paymentService.createOrder({
      amount: Math.round(plan.price * 100),
      currency: 'INR',
      receipt: `sub_${subscription._id}`,
      notes: { subscriptionId: subscription._id.toString(), customerId: customer._id.toString(), planName: plan.name },
    });
    subscription.payment.orderId = order.orderId;
    await subscription.save();
    // Matching/trips deferred until payment is verified.
    return {
      subscription,
      plan,
      requiresPayment: true,
      order: { orderId: order.orderId, amount: Math.round(plan.price * 100), currency: 'INR' },
      scheduledDates: [],
    };
  }

  if (method === 'wallet') {
    const debited = await Customer.findOneAndUpdate(
      { _id: customer._id, walletBalance: { $gte: plan.price } },
      { $inc: { walletBalance: -plan.price } },
      { new: true }
    );
    if (!debited) {
      await releaseSubscription(subscription, 'CANCELLED');
      throw new ValidationError(
        `Insufficient wallet balance. This plan costs ₹${plan.price}. Add money to your wallet and try again.`,
        { code: 'INSUFFICIENT_WALLET_BALANCE' }
      );
    }
    subscription.status = 'ACTIVE';
    subscription.payment.status = 'completed';
    subscription.payment.paidAt = new Date();
    await subscription.save();
  }

  // ACTIVE (wallet or instant): link, match, and schedule trips out of band.
  await Customer.findByIdAndUpdate(customer._id, { subscriptionId: subscription._id });
  const match = await runMatchingAndSchedule(subscription);

  return {
    subscription,
    plan,
    requiresPayment: false,
    match,
    scheduledDates: upcomingServiceDates(normalizedDays, start, 7),
  };
}

/**
 * Verify a Razorpay payment and activate the subscription.
 * Returns { verified, subscription, match? }.
 */
async function activateAfterPayment({ userId, subscriptionId, orderId, paymentId, signature }) {
  const customer = await Customer.findOne({ userId });
  if (!customer) throw new NotFoundError('Customer');

  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customerId: customer._id,
    status: 'PENDING_PAYMENT',
    isDeleted: false,
  });
  if (!subscription) throw new NotFoundError('Subscription with pending payment');

  const verification = await paymentService.verifyPayment({ orderId, paymentId, signature });
  if (!verification.verified) {
    await releaseSubscription(subscription, 'CANCELLED');
    subscription.payment.status = 'failed';
    await subscription.save();
    return { verified: false, subscription };
  }

  subscription.status = 'ACTIVE';
  subscription.payment.status = 'completed';
  subscription.payment.paymentId = paymentId;
  subscription.payment.signature = signature;
  subscription.payment.paidAt = new Date();
  await subscription.save();

  await Customer.findByIdAndUpdate(customer._id, { subscriptionId: subscription._id });
  const match = await runMatchingAndSchedule(subscription);

  return { verified: true, subscription, match };
}

/**
 * Match a subscription to a driver, then schedule its trips out of the request
 * path. Tries ranked candidates in order and atomically reserves capacity on
 * the first that has room, so concurrent bookings can't over-assign a driver.
 * Returns a match-shaped result synchronously; trip generation runs async.
 */
async function runMatchingAndSchedule(subscription) {
  const matchResult = await matchSubscription(subscription);
  if (!matchResult.success) {
    logger.info('[subscriptionService] No driver matched', {
      subscriptionId: subscription._id.toString(),
      reason: matchResult.reason,
    });
    return matchResult;
  }

  const candidates = matchResult.allCandidates && matchResult.allCandidates.length
    ? matchResult.allCandidates
    : [{
        driver: matchResult.driver,
        distanceKm: matchResult.distanceKm,
        remainingCapacity: matchResult.remainingCapacity,
        routeCompatibility: matchResult.routeCompatibility,
      }];

  let chosen = null;
  for (const cand of candidates) {
    const res = await assignDriverToSubscription(subscription._id, cand.driver._id, matchResult.area._id);
    if (res.success) {
      chosen = cand;
      break;
    }
  }

  if (!chosen) {
    logger.info('[subscriptionService] All candidate drivers at capacity', {
      subscriptionId: subscription._id.toString(),
    });
    return { success: false, reason: 'All nearby drivers are at capacity', area: matchResult.area };
  }

  scheduleTripsAsync(subscription._id, chosen.driver._id);
  return {
    success: true,
    driver: chosen.driver,
    area: matchResult.area,
    distanceKm: chosen.distanceKm,
    remainingCapacity: chosen.remainingCapacity,
    routeCompatibility: chosen.routeCompatibility,
    allCandidates: matchResult.allCandidates,
  };
}

/**
 * Fire-and-forget: generate this subscription's trips and offer the driver's
 * next pending trip. Runs after the response is sent (setImmediate) so a single
 * booking never blocks on trip generation.
 */
function scheduleTripsAsync(subscriptionId, driverId) {
  setImmediate(async () => {
    try {
      // Lazy require avoids a load-order cycle with DailyTripGenerator.
      const { regenerateForSubscription } = require('./DailyTripGenerator');
      await regenerateForSubscription(subscriptionId, { days: 14 });

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const upcomingTrip = await Trip.findOne({
        driverId,
        serviceDate: { $gte: todayStart },
        assignmentStatus: 'PENDING',
        isDeleted: false,
      }).sort({ serviceDate: 1 });

      if (upcomingTrip) {
        try {
          await offerTripToDriver(upcomingTrip._id);
        } catch (e) {
          /* offer is best-effort */
        }
      }
    } catch (err) {
      logger.error('[subscriptionService] async trip scheduling failed', {
        subscriptionId: subscriptionId.toString(),
        error: err.message,
      });
    }
  });
}

/** Remove a subscription's passenger from all future SCHEDULED trips. */
async function removeSubscriptionFromFutureTrips(subscriptionId) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const trips = await Trip.find({
    'passengers.subscriptionId': subscriptionId,
    serviceDate: { $gte: todayStart },
    status: 'SCHEDULED',
    isDeleted: false,
  });
  for (const trip of trips) {
    trip.passengers = (trip.passengers || []).filter(
      (p) => !p.subscriptionId || p.subscriptionId.toString() !== subscriptionId.toString()
    );
    if (trip.passengers.length === 0) trip.status = 'CANCELLED';
    await trip.save();
  }
  return trips.length;
}

/** Cancel the customer's current subscription and reconcile future trips. */
async function cancelSubscription({ userId }) {
  const customer = await Customer.findOne({ userId });
  if (!customer) throw new NotFoundError('Customer');

  const subscription = await Subscription.findOne({
    customerId: customer._id,
    status: { $in: CURRENT_STATUSES },
    isDeleted: false,
  });
  if (!subscription) throw new NotFoundError('Active subscription');

  subscription.status = 'CANCELLED';
  subscription.isCurrent = false;
  await subscription.save();

  // Release the driver's reserved capacity (guarded so it never goes negative).
  if (subscription.assignedDriverId) {
    await Driver.updateOne(
      { _id: subscription.assignedDriverId, activeSubscriptionCount: { $gt: 0 } },
      { $inc: { activeSubscriptionCount: -1 } }
    );
  }

  const affectedTrips = await removeSubscriptionFromFutureTrips(subscription._id);
  await Customer.findByIdAndUpdate(customer._id, { $unset: { subscriptionId: 1 } });

  return { subscription, affectedTrips };
}

module.exports = {
  TYPE_TO_TIER,
  CURRENT_STATUSES,
  resolvePlanForType,
  assertNoCurrentSubscription,
  createSubscription,
  activateAfterPayment,
  runMatchingAndSchedule,
  cancelSubscription,
  removeSubscriptionFromFutureTrips,
  upcomingServiceDates,
  normalizeScheduleDays,
};
