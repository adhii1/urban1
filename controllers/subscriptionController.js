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
 * POST /api/v1/customer/subscriptions/cancel
 * Cancel the current subscription (delegates to the shared service).
 */
const cancelSubscription = asyncWrapper(async (req, res) => {
  const { subscription, affectedTrips } = await subscriptionService.cancelSubscription({ userId: req.user.id });
  return res.status(200).json(formatResponse('Subscription cancelled.', {
    subscriptionId: subscription._id,
    status: subscription.status,
    affectedTrips,
  }));
});

/**
 * GET /api/v1/customer/subscriptions/booking-eligibility
 * Whether the customer's subscription is scheduled to run today.
 */
const checkBookingEligibility = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  const subscription = await Subscription.findOne({
    customerId: customer._id,
    status: 'ACTIVE',
    isDeleted: false,
  }).populate('planId');

  if (!subscription) {
    return res.status(200).json(formatResponse('No active subscription.', { eligible: false, reason: 'No active subscription' }));
  }

  const plan = subscription.planId;
  if (!plan) {
    return res.status(200).json(formatResponse('Plan configuration missing.', { eligible: false, reason: 'Plan configuration missing' }));
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const start = new Date(subscription.startDate); start.setHours(0, 0, 0, 0);
  const end = new Date(subscription.endDate); end.setHours(0, 0, 0, 0);
  const scheduleDays = subscription.scheduleDays || [];

  if (now < start || now > end) {
    return res.status(200).json(formatResponse('Outside subscription service dates.', {
      eligible: false,
      reason: 'Today is outside your subscription service window.',
    }));
  }

  if (!scheduleDays.includes(now.getDay())) {
    return res.status(200).json(formatResponse('Not scheduled today.', {
      eligible: false,
      reason: plan.tier === 'Weekday'
        ? 'Weekday plan: rides run Monday–Friday only.'
        : 'This subscription is not scheduled for today.',
      scheduleDays,
    }));
  }

  // Hybrid weekly cap.
  if (plan.tier === 'Hybrid') {
    const maxPerWeek = plan.bookingRules?.allowedDaysPerWeek || 3;
    if ((subscription.bookingsThisWeek || 0) >= maxPerWeek) {
      return res.status(200).json(formatResponse('Weekly limit reached.', {
        eligible: false,
        reason: `You have used all ${maxPerWeek} bookings this week.`,
        bookingsThisWeek: subscription.bookingsThisWeek || 0,
        maxPerWeek,
      }));
    }
  }

  return res.status(200).json(formatResponse('Eligible to book.', {
    eligible: true,
    plan: {
      name: plan.name,
      tier: plan.tier,
      isSharedRide: plan.bookingRules?.isSharedRide,
      maxPassengersPerBooking: plan.bookingRules?.maxPassengersPerBooking || 1,
    },
    subscription: {
      scheduleDays,
      pickupTime: subscription.pickupTime,
      bookingsThisWeek: subscription.bookingsThisWeek || 0,
    },
  }));
});

module.exports = {
  browsePlans,
  initiatePurchase,
  verifySubscriptionPayment,
  cancelSubscription,
  checkBookingEligibility,
};
