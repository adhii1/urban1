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
const OperationalException = require('../models/OperationalException');
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

// Statuses that make a subscription "current" — live enough to occupy its
// pickup slot. A customer may hold any number of these at once, as long as no
// two want the same pickupTime on a shared day.
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
  if (!Array.isArray(scheduleDays)
    || scheduleDays.length !== 3
    || new Set(scheduleDays).size !== 3
    || !scheduleDays.every((day) => Number.isInteger(day) && day >= 1 && day <= 5)) {
    throw new ValidationError('For HYBRID, select exactly 3 different weekdays from Monday to Friday.', { code: 'HYBRID_DAYS_REQUIRED' });
  }
  return [...scheduleDays].sort((a, b) => a - b);
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

/**
 * Find a live subscription that would clash with a new one.
 *
 * A customer can hold as many subscriptions as they want — a weekday commute at
 * 08:00, an evening return at 18:00, a Saturday shuttle. What they can't hold is
 * two that want the same pickupTime on a shared day, since they can only be
 * picked up once. Days are compared by intersection: [1,2,3,4,5] and [3,4,5]
 * clash on Wednesday, whereas [1,2,3] and [4,5] don't overlap at all.
 *
 * This produces the friendly error; the customer_schedule_slot_unique index in
 * models/Subscription.js is what actually enforces it under concurrency.
 */
async function findConflictingSubscription(customerId, pickupTime, scheduleDays) {
  return Subscription.findOne({
    customerId,
    isCurrent: true,
    isDeleted: false,
    pickupTime,
    scheduleDays: { $in: scheduleDays },
  })
    .select('_id subscriptionType status pickupTime scheduleDays')
    .lean();
}

const DAY_NAMES = Object.freeze(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);

/** "Monday and Wednesday" / "Monday, Wednesday and Friday" */
function formatDays(days) {
  const names = [...days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).filter(Boolean);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Reject a new subscription that collides with an existing one, naming the
 * overlapping days so the customer knows what to change.
 */
async function assertNoScheduleConflict(customerId, pickupTime, scheduleDays) {
  const clash = await findConflictingSubscription(customerId, pickupTime, scheduleDays);
  if (!clash) return;

  const overlap = (clash.scheduleDays || []).filter((d) => scheduleDays.includes(d));
  throw new ConflictError(
    `You already have a ${clash.subscriptionType} subscription picking you up at ${pickupTime} on ${formatDays(overlap)}. ` +
    'Choose a different time or different days, or cancel that subscription first.',
    { code: 'SUBSCRIPTION_SCHEDULE_CONFLICT', conflictingSubscriptionId: clash._id, conflictingDays: overlap }
  );
}

/** Release a subscription's "current" slot and mark a terminal/failed status. */
async function releaseSubscription(subscription, status) {
  subscription.status = status;
  subscription.isCurrent = false;
  await subscription.save();
  return subscription;
}

/**
 * Create a subscription. Reserves its pickup slot atomically (as
 * PENDING_PAYMENT, or ACTIVE for instant), then runs the payment state machine.
 *
 * A customer may already hold other subscriptions; only one wanting the same
 * pickupTime on a shared day is refused.
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

  await assertNoScheduleConflict(customer._id, pickupTime, normalizedDays);

  const start = normalizeStartDate(startDate);
  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + (plan.durationDays || DEFAULT_DURATION_DAYS));

  // Reserve the slot. customer_schedule_slot_unique is the authoritative guard:
  // two racing requests for the same time+day can't both land, even though the
  // check above passed for both.
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
    // Lost a race against a concurrent request for the same time+day slot.
    if (err && err.code === 11000) {
      await assertNoScheduleConflict(customer._id, pickupTime, normalizedDays);
      // The conflicting row is already gone (cancelled between the write and
      // this read), so there's nothing useful to name.
      throw new ConflictError(
        'That pickup slot was just taken by another request. Please try again.',
        { code: 'SUBSCRIPTION_SLOT_RACE' }
      );
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
    logger.info('[subscriptionService] No driver matched from search, attempting fallback to active drivers', {
      subscriptionId: subscription._id.toString(),
      reason: matchResult.reason,
    });

    // Create an OperationalException so admin/ops can see the unmatched subscription.
    try {
      await OperationalException.create({
        type: 'UNASSIGNED_DRIVER',
        subscriptionId: subscription._id,
        serviceDate: new Date(),
        reason: matchResult.reason || 'No driver found during subscription matching',
        status: 'OPEN',
      });
    } catch (exErr) {
      logger.warn('[subscriptionService] Could not create OperationalException', { error: exErr.message });
    }

    // Keep the booking covered when normal area/radius/capacity matching finds
    // no candidate. This is an explicit operational fallback: only an active,
    // non-deleted driver may receive it, even though capacity is overridden.
    const fallbackDriver = await Driver.findOne({ status: 'ACTIVE', isDeleted: false })
      .sort({ activeSubscriptionCount: 1, updatedAt: 1 });
    if (fallbackDriver) {
      const assignment = await assignDriverToSubscription(
        subscription._id,
        fallbackDriver._id,
        fallbackDriver.areaId,
        { force: true },
      );
      if (assignment.success) {
        const { regenerateForSubscription } = require('./DailyTripGenerator');
        await regenerateForSubscription(subscription._id).catch((error) => {
          logger.warn('[subscriptionService] Fallback trip generation failed', {
            subscriptionId: subscription._id.toString(),
            error: error.message,
          });
        });
        return {
          success: true,
          driver: fallbackDriver,
          area: { _id: fallbackDriver.areaId, name: 'Fallback assignment' },
          distanceKm: null,
          remainingCapacity: 0,
          routeCompatibility: 0,
          fallback: true,
          reason: matchResult.reason,
        };
      }
    }

    // Total failure — create a DRIVER_ASSIGNMENT_FAILED exception too.
    try {
      await OperationalException.create({
        type: 'DRIVER_ASSIGNMENT_FAILED',
        subscriptionId: subscription._id,
        serviceDate: new Date(),
        reason: 'No drivers exist in the system. Manual assignment required.',
        status: 'OPEN',
      });
    } catch (exErr) {
      logger.warn('[subscriptionService] Could not create DRIVER_ASSIGNMENT_FAILED exception', { error: exErr.message });
    }

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
    const res = await assignDriverToSubscription(subscription._id, cand.driver._id, matchResult.area?._id);
    if (res.success) {
      chosen = cand;
      break;
    }
  }

  // If candidate capacity was reached, force assign so subscription is NEVER left unassigned
  if (!chosen && candidates.length > 0) {
    const fallback = candidates[0];
    await assignDriverToSubscription(subscription._id, fallback.driver._id, matchResult.area?._id, { force: true });
    chosen = fallback;
  }

  if (chosen) {
    scheduleTripsAsync(subscription._id, chosen.driver._id);
    // Also trigger immediate sync trip generation to ensure trips exist in database
    const { regenerateForSubscription } = require('./DailyTripGenerator');
    await regenerateForSubscription(subscription._id).catch((err) => logger.error('[subscriptionService] Trip generation error:', err));
  }

  return {
    success: true,
    driver: chosen?.driver,
    area: matchResult.area,
    distanceKm: chosen?.distanceKm || 0,
    remainingCapacity: chosen?.remainingCapacity || 4,
    routeCompatibility: chosen?.routeCompatibility || 1,
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

/**
 * Point Customer.subscriptionId at a remaining live subscription, or clear it.
 *
 * The field predates multiple subscriptions and is a single ref, so it can only
 * ever name one. It's kept as a "primary" pointer for the legacy readers that
 * populate it (customerController.getProfile, adminController listings); the
 * authoritative list is always a Subscription query. Without this, cancelling
 * any one subscription would blank the pointer and make the customer look
 * unsubscribed while other subscriptions were still running.
 */
async function repointPrimarySubscription(customerId, excludeSubscriptionId) {
  const replacement = await Subscription.findOne({
    customerId,
    _id: { $ne: excludeSubscriptionId },
    status: { $in: CURRENT_STATUSES },
    isDeleted: false,
  })
    .sort({ status: 1, createdAt: -1 }) // ACTIVE sorts before PAUSED/PENDING_PAYMENT
    .select('_id')
    .lean();

  if (replacement) {
    await Customer.findByIdAndUpdate(customerId, { subscriptionId: replacement._id });
  } else {
    await Customer.findByIdAndUpdate(customerId, { $unset: { subscriptionId: 1 } });
  }
  return replacement ? replacement._id : null;
}

/** Every subscription a customer holds, newest first. */
async function listSubscriptions({ userId, includeInactive = false }) {
  const customer = await Customer.findOne({ userId });
  if (!customer) throw new NotFoundError('Customer');

  const filter = { customerId: customer._id, isDeleted: false };
  if (!includeInactive) filter.status = { $in: CURRENT_STATUSES };

  const subscriptions = await Subscription.find(filter)
    .populate('planId', 'name tier serviceType price durationDays features')
    .populate('assignedDriverId', 'name vehicleNumber vehicleModel vehicleCapacity')
    .populate('assignedAreaId', 'name')
    .sort({ createdAt: -1 });

  return { customer, subscriptions };
}

/**
 * Cancel one subscription and reconcile its future trips.
 *
 * `subscriptionId` is required whenever the customer holds more than one live
 * subscription — cancelling "the" subscription is no longer well defined, and
 * silently picking one would cancel the wrong commute. It stays optional for the
 * single-subscription case so existing clients keep working.
 */
async function cancelSubscription({ userId, subscriptionId } = {}) {
  const customer = await Customer.findOne({ userId });
  if (!customer) throw new NotFoundError('Customer');

  let subscription;
  if (subscriptionId) {
    subscription = await Subscription.findOne({
      _id: subscriptionId,
      customerId: customer._id,
      status: { $in: CURRENT_STATUSES },
      isDeleted: false,
    });
    if (!subscription) throw new NotFoundError('Active subscription');
  } else {
    const live = await Subscription.find({
      customerId: customer._id,
      status: { $in: CURRENT_STATUSES },
      isDeleted: false,
    }).sort({ createdAt: -1 });

    if (live.length === 0) throw new NotFoundError('Active subscription');
    if (live.length > 1) {
      throw new ValidationError(
        `You have ${live.length} active subscriptions. Say which one to cancel.`,
        {
          code: 'SUBSCRIPTION_ID_REQUIRED',
          subscriptions: live.map((s) => ({
            _id: s._id,
            subscriptionType: s.subscriptionType,
            pickupTime: s.pickupTime,
            scheduleDays: s.scheduleDays,
            status: s.status,
          })),
        }
      );
    }
    [subscription] = live;
  }

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
  const remainingPrimary = await repointPrimarySubscription(customer._id, subscription._id);

  return { subscription, affectedTrips, remainingPrimary };
}

/**
 * Increment bookingsThisWeek for HYBRID subscriptions when a trip day arrives.
 * Called by DailyTripGenerator when generating trips for a given service date.
 *
 * The weekly counter resets automatically: if today is past weekResetDate, we
 * start a fresh week before incrementing. This ensures the cap is per calendar
 * week, not per rolling 7-day window.
 *
 * Returns the updated subscription doc (or null if not found / not HYBRID).
 */
async function incrementBookingsThisWeek(subscriptionId, serviceDate) {
  const subscription = await Subscription.findById(subscriptionId);
  if (!subscription || subscription.subscriptionType !== 'HYBRID') return null;

  const now = serviceDate ? new Date(serviceDate) : new Date();
  const weekReset = subscription.weekResetDate ? new Date(subscription.weekResetDate) : null;

  // Start of the current ISO week (Monday 00:00:00 local)
  const weekStart = new Date(now);
  const day = weekStart.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);

  if (!weekReset || weekReset < weekStart) {
    // New week — reset the counter before incrementing
    subscription.bookingsThisWeek = 1;
    subscription.weekResetDate = weekStart;
  } else {
    subscription.bookingsThisWeek = (subscription.bookingsThisWeek || 0) + 1;
  }

  await subscription.save();
  logger.info('[subscriptionService] incremented bookingsThisWeek', {
    subscriptionId: subscription._id,
    bookingsThisWeek: subscription.bookingsThisWeek,
    weekResetDate: subscription.weekResetDate,
  });
  return subscription;
}

module.exports = {
  TYPE_TO_TIER,
  CURRENT_STATUSES,
  resolvePlanForType,
  findConflictingSubscription,
  assertNoScheduleConflict,
  repointPrimarySubscription,
  listSubscriptions,
  createSubscription,
  activateAfterPayment,
  runMatchingAndSchedule,
  cancelSubscription,
  removeSubscriptionFromFutureTrips,
  upcomingServiceDates,
  normalizeScheduleDays,
  incrementBookingsThisWeek,
};
