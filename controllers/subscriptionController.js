/**
 * subscriptionController — customer-facing subscription HTTP endpoints.
 *
 * Lifecycle logic lives in services/subscriptionService.js. This controller
 * handles the plan catalog, the Razorpay create/verify entry, cancellation,
 * and booking-eligibility checks. All of it is coordinate/area based; the
 * legacy route/stop purchase path has been retired.
 */

const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const Customer = require('../models/Customer');
const subscriptionService = require('../services/subscriptionService');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { NotFoundError } = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * GET /api/v1/customer/plans
 * Browse available plans (public catalog for customers).
 */
const browsePlans = asyncWrapper(async (req, res) => {
  const { serviceType, tier } = req.query;
  const filter = { isActive: true, isDeleted: false };
  if (serviceType) filter.serviceType = serviceType;
  if (tier) filter.tier = tier;

  const plans = await Plan.find(filter).sort({ serviceType: 1, tier: 1, price: 1 });
  return res.status(200).json(formatResponse('Plans retrieved successfully.', plans));
});

/**
 * POST /api/v1/customer/subscriptions/purchase
 * Create a subscription paid via Razorpay. Body is the unified coordinate shape
 * (subscriptionType, pickup/drop coordinates, scheduleDays, pickupTime,
 * startDate). Returns a Razorpay order to complete on the client, followed by
 * /verify-payment.
 */
const initiatePurchase = asyncWrapper(async (req, res) => {
  const { subscriptionType, pickupLocation, dropLocation, scheduleDays, pickupTime, startDate } = req.body;

  const result = await subscriptionService.createSubscription({
    userId: req.user.id,
    subscriptionType,
    pickupLocation,
    dropLocation,
    scheduleDays,
    pickupTime,
    startDate,
    paymentMethod: 'razorpay',
  });

  const { subscription, plan, order } = result;

  return res.status(201).json(formatResponse('Subscription order created. Complete payment to activate.', {
    subscriptionId: subscription._id,
    orderId: order.orderId,
    amount: order.amount,
    currency: order.currency,
    plan: {
      name: plan.name,
      tier: plan.tier,
      serviceType: plan.serviceType,
      durationDays: plan.durationDays,
      price: plan.price,
    },
  }));
});

/**
 * POST /api/v1/customer/subscriptions/verify-payment
 * Verify a Razorpay payment and activate the subscription.
 * Body: { subscriptionId, orderId, paymentId, signature }
 */
const verifySubscriptionPayment = asyncWrapper(async (req, res) => {
  const { subscriptionId, orderId, paymentId, signature } = req.body;

  const { verified, subscription } = await subscriptionService.activateAfterPayment({
    userId: req.user.id,
    subscriptionId,
    orderId,
    paymentId,
    signature,
  });

  if (!verified) {
    return res.status(400).json(formatResponse('Payment verification failed. Subscription cancelled.', null));
  }

  logger.info('Subscription activated after payment', { subscriptionId: subscription._id });

  return res.status(200).json(formatResponse('Payment verified. Subscription activated!', {
    subscriptionId: subscription._id,
    status: subscription.status,
    startDate: subscription.startDate,
    endDate: subscription.endDate,
  }));
});

/**
 * GET /api/v1/customer/subscriptions
 * Every subscription the customer holds. `?includeInactive=true` adds
 * cancelled/expired ones for history.
 */
const listSubscriptions = asyncWrapper(async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  const { customer, subscriptions } = await subscriptionService.listSubscriptions({
    userId: req.user.id,
    includeInactive,
  });

  return res.status(200).json(formatResponse('Subscriptions retrieved.', {
    subscriptions,
    count: subscriptions.length,
    primarySubscriptionId: customer.subscriptionId || null,
  }));
});

/**
 * POST /api/v1/customer/subscriptions/cancel
 * Cancel one subscription. Body: { subscriptionId } — required when the
 * customer holds more than one, since there's no single "current" one to mean.
 */
const cancelSubscription = asyncWrapper(async (req, res) => {
  const { subscription, affectedTrips, remainingPrimary } = await subscriptionService.cancelSubscription({
    userId: req.user.id,
    subscriptionId: req.body?.subscriptionId,
  });
  return res.status(200).json(formatResponse('Subscription cancelled.', {
    subscriptionId: subscription._id,
    status: subscription.status,
    affectedTrips,
    remainingPrimary,
  }));
});

/**
 * Is this subscription usable today? Pure function over one subscription.
 * Returns the per-subscription eligibility record used below.
 */
function evaluateEligibility(subscription, today) {
  const base = {
    subscriptionId: subscription._id,
    subscriptionType: subscription.subscriptionType,
    pickupTime: subscription.pickupTime,
    scheduleDays: subscription.scheduleDays || [],
  };

  const plan = subscription.planId;
  if (!plan) return { ...base, eligible: false, reason: 'Plan configuration missing' };

  const start = new Date(subscription.startDate); start.setHours(0, 0, 0, 0);
  const end = new Date(subscription.endDate); end.setHours(0, 0, 0, 0);

  if (today < start || today > end) {
    return { ...base, eligible: false, reason: 'Today is outside your subscription service window.' };
  }

  if (!base.scheduleDays.includes(today.getDay())) {
    return {
      ...base,
      eligible: false,
      reason: plan.tier === 'Weekday'
        ? 'Weekday plan: rides run Monday–Friday only.'
        : 'This subscription is not scheduled for today.',
    };
  }

  if (plan.tier === 'Hybrid') {
    const maxPerWeek = plan.bookingRules?.allowedDaysPerWeek || 3;
    const used = subscription.bookingsThisWeek || 0;
    if (used >= maxPerWeek) {
      return {
        ...base,
        eligible: false,
        reason: `You have used all ${maxPerWeek} bookings this week.`,
        bookingsThisWeek: used,
        maxPerWeek,
      };
    }
  }

  return {
    ...base,
    eligible: true,
    plan: {
      name: plan.name,
      tier: plan.tier,
      isSharedRide: plan.bookingRules?.isSharedRide,
      maxPassengersPerBooking: plan.bookingRules?.maxPassengersPerBooking || 1,
    },
    bookingsThisWeek: subscription.bookingsThisWeek || 0,
  };
}

/**
 * GET /api/v1/customer/subscriptions/booking-eligibility
 * Which of the customer's subscriptions can be used today.
 *
 * A customer can hold several, so this evaluates all of them and returns a
 * `subscriptions` array. The top-level `eligible` / `plan` / `subscription`
 * fields describe the best candidate (earliest eligible pickup, else the first
 * subscription) and are kept for clients written against the single-subscription
 * response.
 */
const checkBookingEligibility = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  const subscriptions = await Subscription.find({
    customerId: customer._id,
    status: 'ACTIVE',
    isDeleted: false,
  })
    .populate('planId')
    .sort({ pickupTime: 1 });

  if (subscriptions.length === 0) {
    return res.status(200).json(formatResponse('No active subscription.', {
      eligible: false,
      reason: 'No active subscription',
      subscriptions: [],
    }));
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const evaluated = subscriptions.map((sub) => evaluateEligibility(sub, today));

  const best = evaluated.find((e) => e.eligible) || evaluated[0];
  const anyEligible = Boolean(evaluated.some((e) => e.eligible));

  return res.status(200).json(formatResponse(
    anyEligible ? 'Eligible to book.' : best.reason,
    {
      eligible: anyEligible,
      reason: anyEligible ? null : best.reason,
      plan: best.plan || null,
      subscription: {
        subscriptionId: best.subscriptionId,
        scheduleDays: best.scheduleDays,
        pickupTime: best.pickupTime,
        bookingsThisWeek: best.bookingsThisWeek || 0,
      },
      scheduleDays: best.scheduleDays,
      subscriptions: evaluated,
    }
  ));
});

module.exports = {
  browsePlans,
  initiatePurchase,
  verifySubscriptionPayment,
  listSubscriptions,
  cancelSubscription,
  checkBookingEligibility,
};
