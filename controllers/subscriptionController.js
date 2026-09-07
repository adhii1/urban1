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
const EmergencyContact = require('../models/EmergencyContact');
const SosAlert = require('../models/SosAlert');
const subscriptionService = require('../services/subscriptionService');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { NotFoundError, ValidationError } = require('../utils/AppError');
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

/**
 * Emergency Mode lives on the subscription, not the customer profile: a
 * commute-specific SOS toggle (e.g. armed for a late shuttle, off for a
 * daytime weekday run). The contacts themselves are still the customer's
 * (GET/POST/PUT/DELETE /customer/emergency-contacts), reused as-is here.
 */

async function findOwnedSubscription(userId, subscriptionId) {
  const customer = await Customer.findOne({ userId });
  if (!customer) throw new NotFoundError('Customer');
  if (!subscriptionId) throw new ValidationError('subscriptionId is required.');

  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customerId: customer._id,
    isDeleted: false,
  });
  if (!subscription) throw new NotFoundError('Subscription');
  return { customer, subscription };
}

/**
 * GET /api/v1/customer/subscriptions/:id/emergency-mode
 * Current Emergency Mode state for one subscription, plus the customer's
 * saved emergency contacts (so the client can show both in one screen).
 */
const getEmergencyMode = asyncWrapper(async (req, res) => {
  const { customer, subscription } = await findOwnedSubscription(req.user.id, req.params.id);
  const contacts = await EmergencyContact.find({ customerId: customer._id }).sort({ createdAt: -1 });

  return res.json(formatResponse('Emergency mode retrieved.', {
    subscriptionId: subscription._id,
    emergencyMode: {
      enabled: subscription.emergencyMode?.enabled !== false,
      lastTriggeredAt: subscription.emergencyMode?.lastTriggeredAt || null,
    },
    contacts,
  }));
});

/**
 * PUT /api/v1/customer/subscriptions/:id/emergency-mode
 * Body: { enabled: boolean } — arms/disarms SOS for this one subscription.
 */
const updateEmergencyMode = asyncWrapper(async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') throw new ValidationError('enabled must be true or false.');

  const { subscription } = await findOwnedSubscription(req.user.id, req.params.id);
  subscription.emergencyMode = { ...(subscription.emergencyMode?.toObject?.() || subscription.emergencyMode || {}), enabled };
  await subscription.save();

  return res.json(formatResponse(`Emergency mode ${enabled ? 'enabled' : 'disabled'}.`, {
    subscriptionId: subscription._id,
    emergencyMode: { enabled, lastTriggeredAt: subscription.emergencyMode?.lastTriggeredAt || null },
  }));
});

/**
 * POST /api/v1/customer/subscriptions/:id/sos
 * Fire an SOS alert for the given subscription's active commute. Requires
 * Emergency Mode to be armed on that subscription. Body: { coordinates? }
 * ([lng, lat], optional). Notifies every active admin the same way other
 * customer operations are broadcast.
 */
const triggerSos = asyncWrapper(async (req, res) => {
  const { customer, subscription } = await findOwnedSubscription(req.user.id, req.params.id);

  if (subscription.emergencyMode?.enabled === false) {
    throw new ValidationError('Emergency mode is turned off for this subscription. Enable it first.', { code: 'EMERGENCY_MODE_DISABLED' });
  }

  const contacts = await EmergencyContact.find({ customerId: customer._id });
  const coords = Array.isArray(req.body?.coordinates) && req.body.coordinates.length === 2
    ? req.body.coordinates
    : subscription.pickupLocation?.coordinates || [0, 0];

  const alert = await SosAlert.create({
    customerId: customer._id,
    subscriptionId: subscription._id,
    location: { type: 'Point', coordinates: coords },
    notifiedContacts: contacts.length,
  });

  subscription.emergencyMode = { ...(subscription.emergencyMode?.toObject?.() || subscription.emergencyMode || {}), enabled: true, lastTriggeredAt: new Date() };
  await subscription.save();

  const { publishCustomerOperation } = require('../services/customerOperationService');
  await publishCustomerOperation({
    type: 'SOS_TRIGGERED',
    customerId: customer._id,
    title: 'SOS alert triggered',
    summary: `Customer triggered emergency SOS during a ${subscription.subscriptionType} commute.`,
    metadata: { sosAlertId: alert._id.toString(), subscriptionId: subscription._id.toString(), notifiedContacts: contacts.length },
  });

  logger.warn('[SOS] Emergency alert triggered', { subscriptionId: subscription._id.toString(), customerId: customer._id.toString() });

  return res.status(201).json(formatResponse('Emergency dispatch alerted. Stand by.', {
    alertId: alert._id,
    notifiedContacts: contacts.length,
  }));
});

module.exports = {
  browsePlans,
  initiatePurchase,
  verifySubscriptionPayment,
  listSubscriptions,
  cancelSubscription,
  checkBookingEligibility,
  getEmergencyMode,
  updateEmergencyMode,
  triggerSos,
};
