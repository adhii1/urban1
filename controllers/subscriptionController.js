const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const Route = require('../models/Route');
const Customer = require('../models/Customer');
const paymentService = require('../services/paymentService');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { NotFoundError, ValidationError } = require('../utils/AppError');
const logger = require('../utils/logger');
const subscriptionPolicyService = require('../services/subscriptionPolicyService');
const { generateForServiceDate } = require('../services/tripGenerator');

/**
 * Build activation-time recurring service exclusively through the canonical
 * generator. This preserves route/date idempotency and operational exception
 * behavior (including unassigned routes and assignment failures).
 */
async function scheduleRecurringTrips(subscription) {
  const startDate = new Date(subscription.startDate);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(subscription.endDate);
  endDate.setHours(0, 0, 0, 0);
  let manifestEntries = 0;

  for (const serviceDate = new Date(startDate); serviceDate <= endDate; serviceDate.setDate(serviceDate.getDate() + 1)) {
    const summary = await generateForServiceDate(new Date(serviceDate), {
      routeIds: [subscription.routeId.toString()],
    });
    manifestEntries += summary.manifestEntries;
  }

  logger.info('[RecurringTrips] Generated activation-time recurring service', {
    subscriptionId: subscription._id,
    routeId: subscription.routeId,
    manifestEntries,
  });
  return manifestEntries;
}

/**
 * GET /api/v1/customer/plans
 * Browse all available plans (public for customers)
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
 * GET /api/v1/customer/plans/:id/routes
 * Get available routes for a plan (routes with stops for managed plans)
 */
const getRoutesForPlan = asyncWrapper(async (req, res) => {
  const plan = await Plan.findById(req.params.id);
  if (!plan) throw new NotFoundError('Plan');

  // Return all active routes with their stops
  const routes = await Route.find({ status: 'ACTIVE', isDeleted: false })
    .select('name startLocation endLocation stops')
    .lean();

  return res.status(200).json(formatResponse('Routes retrieved.', routes));
});

/**
 * POST /api/v1/customer/subscriptions/purchase
 * Customer initiates subscription purchase
 * Body: { planId, routeId, startDate, selectedWeekdays?, pickupStopIndex?, dropStopIndex? }
 */
const initiatePurchase = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  const {
    planId,
    routeId,
    startDate,
    selectedWeekdays,
    pickupStopId,
    dropStopId,
    pickupStopIndex,
    dropStopIndex,
  } = req.body;

  // Load the complete records; active-route and recurring-plan acceptance is
  // centrally enforced by SubscriptionPolicyService below.
  const plan = await Plan.findOne({ _id: planId, isActive: true, isDeleted: false });
  if (!plan) throw new NotFoundError('Plan');
  const route = await Route.findById(routeId);

  // Check no existing active subscription OF THE SAME TIER
  const existingSub = await Subscription.findOne({
    customerId: customer._id,
    planId: plan._id,
    status: { $in: ['ACTIVE', 'PENDING_PAYMENT'] },
    isDeleted: false,
  });
  if (existingSub) {
    throw new ValidationError('You already have an active subscription for this plan type.', {
      code: 'DUPLICATE_SUBSCRIPTION',
    });
  }

  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) {
    throw new ValidationError('A valid subscription start date is required.', { code: 'INVALID_SUBSCRIPTION_START_DATE' });
  }
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start < today) {
    throw new ValidationError('Subscription start date cannot be in the past.', { code: 'SUBSCRIPTION_START_DATE_IN_PAST' });
  }

  // This must complete before a pending subscription or payment order is
  // created. The returned selection is the only source for durable stop data.
  const policy = subscriptionPolicyService.validateRecurringSubscription({
    customer,
    plan,
    route,
    selectedWeekdays,
    pickupStopId,
    dropStopId,
    pickupStopIndex,
    dropStopIndex,
  });

  // Calculate end date
  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + plan.durationDays);

  // Create subscription in PENDING_PAYMENT state
  const subscription = await Subscription.create({
    customerId: customer._id,
    planId: plan._id,
    routeId: route._id,
    startDate: start,
    endDate,
    remainingPauseDays: plan.pauseDaysAllowed,
    status: 'PENDING_PAYMENT',
    selectedWeekdays: policy.normalizedWeekdays,
    pickupStopId: policy.pickupStopId,
    dropStopId: policy.dropStopId,
    pickupStopSequence: policy.pickupStopSequence,
    dropStopSequence: policy.dropStopSequence,
    // Retain legacy indexes only when supplied by an older caller. New writes
    // always have authoritative durable stop IDs and sequence snapshots.
    pickupStopIndex,
    dropStopIndex,
    payment: {
      amount: plan.price,
      status: 'pending',
    },
  });

  // Create Razorpay order
  const amountInPaise = Math.round(plan.price * 100);
  const order = await paymentService.createOrder({
    amount: amountInPaise,
    currency: 'INR',
    receipt: `sub_${subscription._id}`,
    notes: {
      subscriptionId: subscription._id.toString(),
      customerId: customer._id.toString(),
      planName: plan.name,
    },
  });

  // Store order ID
  subscription.payment.orderId = order.orderId;
  await subscription.save();

  return res.status(201).json(formatResponse('Subscription order created. Complete payment to activate.', {
    subscriptionId: subscription._id,
    orderId: order.orderId,
    amount: amountInPaise,
    currency: 'INR',
    plan: {
      name: plan.name,
      tier: plan.tier,
      serviceType: plan.serviceType,
      durationDays: plan.durationDays,
      price: plan.price,
    },
    route: {
      name: route.name,
      startLocation: route.startLocation,
      endLocation: route.endLocation,
    },
  }));
});

/**
 * POST /api/v1/customer/subscriptions/verify-payment
 * Verify payment and activate subscription
 * Body: { subscriptionId, orderId, paymentId, signature }
 */
const verifySubscriptionPayment = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  const { subscriptionId, orderId, paymentId, signature } = req.body;

  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customerId: customer._id,
    status: 'PENDING_PAYMENT',
    isDeleted: false,
  });

  if (!subscription) {
    throw new NotFoundError('Subscription with pending payment');
  }

  // Verify payment
  const verification = await paymentService.verifyPayment({ orderId, paymentId, signature });

  if (!verification.verified) {
    subscription.payment.status = 'failed';
    subscription.status = 'CANCELLED';
    await subscription.save();
    return res.status(400).json(formatResponse('Payment verification failed. Subscription cancelled.', null));
  }

  // Activate subscription
  subscription.status = 'ACTIVE';
  subscription.payment.paymentId = paymentId;
  subscription.payment.signature = signature;
  subscription.payment.status = 'completed';
  subscription.payment.paidAt = new Date();
  await subscription.save();

  // Link to customer
  await Customer.findByIdAndUpdate(customer._id, { subscriptionId: subscription._id });

  // Shared recurring plans create future driver-assigned trips. They are
  // preallocated shuttle work, so the driver does not receive an accept offer.
  const plan = await Plan.findById(subscription.planId);
  const route = await Route.findById(subscription.routeId);
  let scheduledTripCount = 0;
  if (plan && route && plan.bookingRules?.isSharedRide) {
    scheduledTripCount = await scheduleRecurringTrips(subscription, plan, route, customer);
  }

  logger.info(`Subscription activated for customer ${customer._id}`, {
    subscriptionId: subscription._id,
    paymentId,
    scheduledTripCount,
  });

  return res.status(200).json(formatResponse('Payment verified. Subscription activated!', {
    subscriptionId: subscription._id,
    status: 'ACTIVE',
    scheduledTripCount,
    startDate: subscription.startDate,
    endDate: subscription.endDate,
  }));
});

/**
 * POST /api/v1/customer/subscriptions/cancel
 * Cancel active subscription (with potential refund)
 */
const cancelSubscription = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  const subscription = await Subscription.findOne({
    customerId: customer._id,
    status: { $in: ['ACTIVE', 'PAUSED'] },
    isDeleted: false,
  });

  if (!subscription) {
    throw new NotFoundError('Active subscription');
  }

  subscription.status = 'CANCELLED';
  await subscription.save();

  // Remove future recurring assignments created for this subscription. A trip
  // that becomes empty is cancelled; shared trips retain other passengers.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const futureTrips = await Trip.find({
    'manifest.subscriptionId': subscription._id,
    tripDate: { $gte: today },
    status: 'SCHEDULED',
  });
  for (const trip of futureTrips) {
    trip.manifest = trip.manifest.filter(entry => !entry.subscriptionId || entry.subscriptionId.toString() !== subscription._id.toString());
    if (trip.manifest.length === 0) trip.status = 'CANCELLED';
    await trip.save();
  }

  await Customer.findByIdAndUpdate(customer._id, { $unset: { subscriptionId: 1 } });

  return res.status(200).json(formatResponse('Subscription cancelled.', {
    subscriptionId: subscription._id,
    status: 'CANCELLED',
  }));
});

/**
 * GET /api/v1/customer/subscriptions/booking-eligibility
 * Check if customer can book today based on subscription rules
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
    return res.status(200).json(formatResponse('Plan not found.', { eligible: false, reason: 'Plan configuration missing' }));
  }

  const now = new Date();
  const rules = plan.bookingRules || {};
  const selectedDays = subscription.selectedWeekdays || [];

  if (!subscriptionPolicyService.isEligibleOnServiceDate({
    subscription,
    plan,
    serviceDate: now,
  })) {
    return res.status(200).json(formatResponse('Not eligible today.', {
      eligible: false,
      reason: plan.tier === 'Weekday'
        ? 'Weekday plan: rides are available Monday-Friday only within the subscription service dates.'
        : 'This subscription is not scheduled for the current service date.',
      selectedWeekdays: plan.tier === 'Hybrid' ? selectedDays : undefined,
    }));
  }

  if (plan.tier === 'Hybrid') {
    const maxPerWeek = rules.allowedDaysPerWeek || 3;
    if (subscription.bookingsThisWeek >= maxPerWeek) {
      return res.status(200).json(formatResponse('Weekly limit reached.', {
        eligible: false,
        reason: `You have used all ${maxPerWeek} bookings this week.`,
        bookingsThisWeek: subscription.bookingsThisWeek,
        maxPerWeek,
      }));
    }
  }

  // Check alternate day mode
  if (rules.isAlternateDay) {
    const startDate = new Date(subscription.startDate);
    const daysSinceStart = Math.floor((now - startDate) / (24 * 60 * 60 * 1000));
    if (daysSinceStart % 2 !== 0) {
      return res.status(200).json(formatResponse('Not eligible today.', {
        eligible: false,
        reason: 'Alternate day plan: you can ride on alternate days only.',
      }));
    }
  }

  // Check advance booking requirement for Flexi
  let minAdvanceMinutes = rules.minAdvanceBookingMinutes || 0;

  return res.status(200).json(formatResponse('Eligible to book.', {
    eligible: true,
    plan: {
      name: plan.name,
      tier: plan.tier,
      isSharedRide: rules.isSharedRide,
      useManagedStops: rules.useManagedStops,
      maxPassengersPerBooking: rules.maxPassengersPerBooking || 1,
      minAdvanceBookingMinutes: minAdvanceMinutes,
    },
    subscription: {
      pickupStopId: subscription.pickupStopId,
      dropStopId: subscription.dropStopId,
      pickupStopSequence: subscription.pickupStopSequence,
      dropStopSequence: subscription.dropStopSequence,
      // Deprecated index fields remain visible only for legacy clients during
      // the durable-stop migration.
      pickupStopIndex: subscription.pickupStopIndex,
      dropStopIndex: subscription.dropStopIndex,
      bookingsThisWeek: subscription.bookingsThisWeek,
    },
  }));
});

module.exports = {
  browsePlans,
  getRoutesForPlan,
  initiatePurchase,
  verifySubscriptionPayment,
  cancelSubscription,
  checkBookingEligibility,
};
