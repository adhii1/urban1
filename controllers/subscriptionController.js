const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const Route = require('../models/Route');
const Customer = require('../models/Customer');
const paymentService = require('../services/paymentService');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { NotFoundError, ValidationError } = require('../utils/AppError');
const logger = require('../utils/logger');
const User = require('../models/User');
const Driver = require('../models/Driver');
const Trip = require('../models/Trip');

const DEMO_DRIVER_PHONE = '9876543210';
const SCHEDULED_TRIP_HOUR = 8;

function isRecurringTripDay(subscription, plan, date) {
  const dayOfWeek = date.getDay();
  if (plan.tier === 'Weekday') return [1, 2, 3, 4, 5].includes(dayOfWeek);
  if (plan.tier === 'Hybrid') return (subscription.selectedWeekdays || []).includes(dayOfWeek);
  return plan.bookingRules?.isSharedRide === true;
}

function getTripDate(date) {
  const tripDate = new Date(date);
  tripDate.setHours(SCHEDULED_TRIP_HOUR, 0, 0, 0);
  return tripDate;
}

async function scheduleRecurringTrips(subscription, plan, route, customer) {
  const rajuUser = await User.findOne({
    phone: DEMO_DRIVER_PHONE,
    role: 'Driver',
    status: 'ACTIVE',
  }).select('_id');
  const raju = rajuUser && await Driver.findOne({
    userId: rajuUser._id,
    status: 'ACTIVE',
  }).select('_id name');
  if (!raju) throw new ValidationError('Raju Kumar is not available for route assignments.');

  if (!route.assignedDriver || route.assignedDriver.toString() !== raju._id.toString()) {
    route.assignedDriver = raju._id;
    await route.save();
  }

  const pickupStop = route.stops?.[subscription.pickupStopIndex] || route.stops?.[0];
  const dropStop = route.stops?.[subscription.dropStopIndex] || route.stops?.[route.stops.length - 1];
  const manifestEntry = {
    customer: customer._id,
    pickupStop: pickupStop && {
      stopName: pickupStop.stopName,
      sequenceOrder: pickupStop.sequenceOrder,
      location: pickupStop.location,
    },
    dropStop: dropStop && {
      stopName: dropStop.stopName,
      sequenceOrder: dropStop.sequenceOrder,
      location: dropStop.location,
    },
    status: 'PENDING',
  };

  const startDate = new Date(subscription.startDate);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(subscription.endDate);
  endDate.setHours(0, 0, 0, 0);
  let scheduledTripCount = 0;

  for (const date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    if (!isRecurringTripDay(subscription, plan, date)) continue;

    const tripDate = getTripDate(date);
    const dayStart = new Date(tripDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    let trip = await Trip.findOne({
      routeId: route._id,
      tripDate: { $gte: dayStart, $lt: dayEnd },
      status: 'SCHEDULED',
      isDeleted: false,
    });

    if (!trip) {
      trip = await Trip.create({
        routeId: route._id,
        driverId: raju._id,
        tripDate,
        manifest: [manifestEntry],
        status: 'SCHEDULED',
      });
      scheduledTripCount += 1;
      continue;
    }

    if (!trip.driverId || trip.driverId.toString() !== raju._id.toString()) {
      trip.driverId = raju._id;
    }
    const alreadyAssigned = trip.manifest.some(entry => entry.customer.toString() === customer._id.toString());
    if (!alreadyAssigned) {
      trip.manifest.push(manifestEntry);
      scheduledTripCount += 1;
    }
    await trip.save();
  }

  logger.info(`[RecurringTrips] Scheduled ${scheduledTripCount} future trip entries for ${customer.name} with Raju Kumar`, {
    subscriptionId: subscription._id,
    routeId: route._id,
  });
  return scheduledTripCount;
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

  const { planId, routeId, startDate, selectedWeekdays, pickupStopIndex, dropStopIndex } = req.body;

  // Validate plan
  const plan = await Plan.findOne({ _id: planId, isActive: true, isDeleted: false });
  if (!plan) throw new NotFoundError('Plan');

  // Validate route
  const route = await Route.findOne({ _id: routeId, status: 'ACTIVE', isDeleted: false });
  if (!route) throw new NotFoundError('Route');

  // Check no existing active subscription OF THE SAME TIER
  const existingSub = await Subscription.findOne({
    customerId: customer._id,
    planId: plan._id,
    status: { $in: ['ACTIVE', 'PENDING_PAYMENT'] },
    isDeleted: false,
  });
  if (existingSub) {
    throw new ValidationError('You already have an active subscription for this plan type.');
  }

  // Validate booking rules
  if (plan.tier === 'Hybrid') {
    if (!selectedWeekdays || selectedWeekdays.length !== (plan.bookingRules?.allowedDaysPerWeek || 3)) {
      throw new ValidationError(
        `Hybrid plan requires exactly ${plan.bookingRules?.allowedDaysPerWeek || 3} weekdays to be selected.`
      );
    }
    // Validate weekday values
    for (const day of selectedWeekdays) {
      if (day < 0 || day > 6) throw new ValidationError('Invalid weekday value.');
    }
  }

  // Validate stop selection for managed-stop plans
  if (plan.bookingRules?.useManagedStops) {
    if (pickupStopIndex === undefined || dropStopIndex === undefined) {
      throw new ValidationError('Please select pickup and drop stops for this plan.');
    }
    if (pickupStopIndex < 0 || pickupStopIndex >= route.stops.length) {
      throw new ValidationError('Invalid pickup stop selection.');
    }
    if (dropStopIndex < 0 || dropStopIndex >= route.stops.length) {
      throw new ValidationError('Invalid drop stop selection.');
    }
    if (pickupStopIndex === dropStopIndex) {
      throw new ValidationError('Pickup and drop stops must be different.');
    }
  }

  // Calculate end date
  const start = new Date(startDate);
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
    selectedWeekdays: plan.tier === 'Hybrid' ? selectedWeekdays : (plan.bookingRules?.allowedWeekdays || []),
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
  const today = now.getDay(); // 0=Sun...6=Sat
  const rules = plan.bookingRules || {};

  // Check if today is an allowed weekday
  if (plan.tier === 'Weekday') {
    // Weekday: Mon-Fri only
    if (today === 0 || today === 6) {
      return res.status(200).json(formatResponse('Not eligible today.', {
        eligible: false,
        reason: 'Weekday plan: rides available Monday-Friday only.',
      }));
    }
  } else if (plan.tier === 'Hybrid') {
    // Hybrid: only on selected weekdays
    const selectedDays = subscription.selectedWeekdays || [];
    if (!selectedDays.includes(today)) {
      return res.status(200).json(formatResponse('Not eligible today.', {
        eligible: false,
        reason: `Hybrid plan: you can ride on ${selectedDays.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')} only.`,
        selectedWeekdays: selectedDays,
      }));
    }

    // Check weekly booking limit
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
