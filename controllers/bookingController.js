/**
 * bookingController — HTTP adapter for the customer subscription flow.
 *
 * All subscription lifecycle logic lives in services/subscriptionService.js.
 * This controller only translates HTTP <-> service calls and shapes responses.
 * The 4 models: Weekday (5-day), Hybrid (3-day), Shuttle (Standard). Flexy is
 * on-demand via the ride-request socket flow — NOT a subscription.
 */

const Customer = require('../models/Customer');
const Subscription = require('../models/Subscription');
const subscriptionService = require('../services/subscriptionService');
const { assignDriverToSubscription, rematchOnLocationChange } = require('../services/SubscriptionMatchingService');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { NotFoundError, ValidationError } = require('../utils/AppError');
const logger = require('../utils/logger');

/** Shape a subscription for the customer client. */
function publicSubscription(sub, plan) {
  return {
    _id: sub._id,
    subscriptionType: sub.subscriptionType,
    scheduleDays: sub.scheduleDays,
    pickupLocation: sub.pickupLocation,
    dropLocation: sub.dropLocation,
    pickupTime: sub.pickupTime,
    startDate: sub.startDate,
    endDate: sub.endDate,
    status: sub.status,
    payment: {
      amount: plan?.price ?? sub.payment?.amount,
      status: sub.payment?.status,
      method: sub.payment?.method,
    },
  };
}

/**
 * POST /api/v1/book
 * Create a subscription booking (Weekday / Hybrid / Shuttle).
 * Body: { subscriptionType, pickupLocation, dropLocation, scheduleDays, pickupTime, startDate, paymentMethod }
 * paymentMethod: 'wallet' (default) | 'razorpay' | 'instant'.
 */
const createBooking = asyncWrapper(async (req, res) => {
  const {
    subscriptionType,
    pickupLocation,
    dropLocation,
    scheduleDays,
    pickupTime,
    startDate,
    paymentMethod,
  } = req.body;

  const result = await subscriptionService.createSubscription({
    userId: req.user.id,
    subscriptionType,
    pickupLocation,
    dropLocation,
    scheduleDays,
    pickupTime,
    startDate,
    paymentMethod: paymentMethod || 'wallet',
  });

  const { subscription, plan } = result;

  // Razorpay: the subscription is PENDING_PAYMENT; client completes checkout
  // then calls /customer/subscriptions/verify-payment.
  if (result.requiresPayment) {
    return res.status(201).json(formatResponse('Subscription order created. Complete payment to activate.', {
      requiresPayment: true,
      subscriptionId: subscription._id,
      order: result.order,
      subscription: publicSubscription(subscription, plan),
      plan: { name: plan.name, tier: plan.tier, price: plan.price },
    }));
  }

  const match = result.match;
  const assignment = match?.success
    ? {
        driver: {
          _id: match.driver._id,
          name: match.driver.name,
          vehicleNumber: match.driver.vehicleNumber,
          vehicleModel: match.driver.vehicleModel,
          vehicleCapacity: match.driver.vehicleCapacity,
        },
        area: match.area?.name,
        distanceKm: Math.round((match.distanceKm || 0) * 10) / 10,
        remainingCapacity: match.remainingCapacity,
      }
    : null;

  logger.info('[Booking] Subscription created', {
    subscriptionId: subscription._id,
    type: subscription.subscriptionType,
    matched: Boolean(match?.success),
    driverName: assignment?.driver?.name || 'unassigned',
  });

  return res.status(201).json(formatResponse('Subscription created successfully.', {
    subscription: publicSubscription(subscription, plan),
    assignment,
    reason: match?.success ? null : match?.reason,
    tripsGenerated: result.scheduledDates,
  }));
});

/**
 * Pick the subscription that best represents "the" booking for legacy callers.
 *
 * Preference order: the customer's primary pointer, then any ACTIVE one, then
 * whatever came first. Used only to keep single-subscription clients working —
 * anything that needs the full picture should read the `subscriptions` array.
 */
function pickPrimary(subscriptions, primaryId) {
  if (primaryId) {
    const pointed = subscriptions.find((s) => s._id.equals(primaryId));
    if (pointed) return pointed;
  }
  return subscriptions.find((s) => s.status === 'ACTIVE') || subscriptions[0];
}

/**
 * GET /api/v1/booking
 * The customer's current subscriptions (+ assigned driver info).
 *
 * A customer can hold several at once, so `data.subscriptions` is the full list.
 * The top-level fields are the primary subscription, kept flat so clients
 * written against the old single-subscription response keep working.
 */
const getMyBooking = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  const subscriptions = await Subscription.find({
    customerId: customer._id,
    status: { $in: subscriptionService.CURRENT_STATUSES },
    isDeleted: false,
  })
    .populate('planId', 'name tier serviceType price durationDays features')
    .populate('assignedDriverId', 'name vehicleNumber vehicleModel vehicleCapacity')
    .populate('assignedAreaId', 'name')
    .sort({ pickupTime: 1, createdAt: 1 });

  if (subscriptions.length === 0) {
    return res.json(formatResponse('No active subscription.', null));
  }

  const primary = pickPrimary(subscriptions, customer.subscriptionId);
  return res.json(formatResponse('Subscription retrieved.', {
    ...primary.toObject(),
    subscriptions,
    subscriptionCount: subscriptions.length,
  }));
});

/**
 * POST /api/v1/booking/cancel
 * Cancel one subscription and reconcile its future trips.
 * Body: { subscriptionId } — required once the customer holds more than one.
 */
const cancelBooking = asyncWrapper(async (req, res) => {
  const { subscription, affectedTrips, remainingPrimary } = await subscriptionService.cancelSubscription({
    userId: req.user.id,
    subscriptionId: req.body?.subscriptionId,
  });
  return res.json(formatResponse('Subscription cancelled successfully.', {
    subscriptionId: subscription._id,
    affectedTrips,
    remainingPrimary,
  }));
});

/**
 * PUT /api/v1/booking/location
 * Change pickup/drop; backend re-evaluates driver assignment (PDF section 19).
 * Body: { pickupLocation, dropLocation, subscriptionId } — `subscriptionId` is
 * required once the customer holds more than one active subscription, since
 * each has its own pickup point.
 */
const updateLocation = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  const { pickupLocation, dropLocation, subscriptionId } = req.body;

  const active = await Subscription.find({
    customerId: customer._id,
    status: 'ACTIVE',
    isDeleted: false,
  }).sort({ pickupTime: 1, createdAt: 1 });

  if (active.length === 0) throw new NotFoundError('Active subscription');

  let subscription;
  if (subscriptionId) {
    subscription = active.find((s) => s._id.equals(subscriptionId));
    if (!subscription) throw new NotFoundError('Active subscription');
  } else if (active.length > 1) {
    throw new ValidationError(
      `You have ${active.length} active subscriptions. Say which one to move.`,
      {
        code: 'SUBSCRIPTION_ID_REQUIRED',
        subscriptions: active.map((s) => ({
          _id: s._id,
          subscriptionType: s.subscriptionType,
          pickupTime: s.pickupTime,
          scheduleDays: s.scheduleDays,
        })),
      }
    );
  } else {
    [subscription] = active;
  }

  if (pickupLocation?.coordinates) {
    subscription.pickupLocation = {
      address: pickupLocation.address || subscription.pickupLocation.address,
      type: 'Point',
      coordinates: pickupLocation.coordinates,
    };
  }
  if (dropLocation?.coordinates) {
    subscription.dropLocation = {
      address: dropLocation.address || subscription.dropLocation.address,
      type: 'Point',
      coordinates: dropLocation.coordinates,
    };
  }
  await subscription.save();

  const result = await rematchOnLocationChange(subscription);
  if (result.success && result.driver) {
    await assignDriverToSubscription(subscription._id, result.driver._id, result.area?._id);
    return res.json(formatResponse(
      result.keptExistingDriver ? 'Location updated. Current driver still valid.' : 'Location updated. New driver assigned.',
      { driver: { name: result.driver.name, vehicleNumber: result.driver.vehicleNumber }, distanceKm: result.distanceKm }
    ));
  }
  return res.json(formatResponse('Location updated but no eligible driver found. Admin will assign one.', { reason: result.reason }));
});

/**
 * GET /api/v1/wallet — balance + subscription payment history.
 */
const getWallet = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  const subscriptions = await Subscription.find({
    customerId: customer._id,
    'payment.status': 'completed',
    isDeleted: false,
  })
    .select('subscriptionType payment.amount payment.paidAt startDate endDate status')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const transactions = subscriptions.map((sub) => ({
    id: sub._id,
    type: 'SUBSCRIPTION_PAYMENT',
    description: `${sub.subscriptionType} subscription`,
    amount: -(sub.payment?.amount || 0),
    date: sub.payment?.paidAt || sub.startDate,
    status: sub.payment?.status || 'completed',
  }));

  return res.json(formatResponse('Wallet retrieved.', {
    balance: customer.walletBalance || 0,
    currency: 'INR',
    transactions,
  }));
});

/**
 * POST /api/v1/wallet/add — credit the wallet (simulated instant top-up).
 */
const addToWallet = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  const { amount } = req.body;
  if (!amount || amount < 1 || amount > 50000) {
    throw new ValidationError('Amount must be between ₹1 and ₹50,000.');
  }

  customer.walletBalance = (customer.walletBalance || 0) + amount;
  await customer.save();

  return res.json(formatResponse('Wallet credited successfully.', {
    balance: customer.walletBalance,
    credited: amount,
  }));
});

module.exports = {
  createBooking,
  getMyBooking,
  cancelBooking,
  updateLocation,
  getWallet,
  addToWallet,
};
