const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const Route = require('../models/Route');
const Customer = require('../models/Customer');
const paymentService = require('../services/paymentService');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { NotFoundError, ValidationError } = require('../utils/AppError');
const logger = require('../utils/logger');

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

  // Immediately create a ride request so it shows on admin + driver gets notified
  const plan = await Plan.findById(subscription.planId);
  const route = await Route.findById(subscription.routeId).populate('assignedDriver');

  if (plan && route && plan.bookingRules?.isSharedRide) {
    const RideRequest = require('../models/RideRequest');
    const Driver = require('../models/Driver');
    const Notification = require('../models/Notification');
    const { emitToUser, getIO } = require('../config/socket');

    const pickupStop = route.stops?.[subscription.pickupStopIndex] || route.stops?.[0];
    const dropStop = route.stops?.[subscription.dropStopIndex] || route.stops?.[route.stops.length - 1];

    // Create ride request for today
    const rideRequest = await RideRequest.create({
      customerId: req.user.id,
      customerName: customer.name,
      pickupLocation: {
        address: pickupStop?.stopName || route.startLocation,
        type: 'Point',
        coordinates: pickupStop?.location?.coordinates || [77.6309, 12.9279],
      },
      dropLocation: {
        address: dropStop?.stopName || route.endLocation,
        type: 'Point',
        coordinates: dropStop?.location?.coordinates || [77.6683, 12.8489],
      },
      status: 'PENDING',
      fare: { estimated: Math.round(plan.price / 30) }, // daily fare estimate
      matchedDrivers: route.assignedDriver ? [{ driverId: route.assignedDriver._id, notifiedAt: new Date() }] : [],
    });

    const io = getIO();

    // Notify admin in real-time
    io.of('/sockets/admin').emit('ride:new', {
      _id: rideRequest._id,
      rideRequestId: rideRequest._id,
      customerId: req.user.id,
      customerName: customer.name,
      status: 'PENDING',
      pickupLocation: rideRequest.pickupLocation,
      dropLocation: rideRequest.dropLocation,
      requestedAt: rideRequest.requestedAt,
      fareEstimate: rideRequest.fare?.estimated,
      type: 'SHUTTLE',
      planName: plan.name,
      routeName: route.name,
    });

    // If this route has a driver assigned by admin, send the offer DIRECTLY
    // to that driver instead of generic geo-matching. This is the correct
    // behavior for Hybrid/Weekday/Stop-to-Stop shuttle plans — the admin
    // has already placed a specific driver on this route/area.
    if (route.assignedDriver && route.assignedDriver.userId) {
      const driverUserId = route.assignedDriver.userId.toString();

      // Persisted notification record (shows on driver's Notifications page)
      await Notification.create({
        userId: driverUserId,
        title: 'New Shuttle Passenger',
        body: `${customer.name} booked ${plan.name} on your route "${route.name}". Pickup: ${rideRequest.pickupLocation.address}`,
        type: 'RIDE',
        metadata: { rideRequestId: rideRequest._id, routeId: route._id, planName: plan.name },
      });

      // Real-time socket push straight to the assigned driver
      emitToUser('driver', driverUserId, 'ride:new-request', {
        rideRequestId: rideRequest._id,
        pickup: rideRequest.pickupLocation,
        drop: rideRequest.dropLocation,
        passengers: [{ rideRequestId: rideRequest._id, customerName: customer.name, pickup: rideRequest.pickupLocation, drop: rideRequest.dropLocation, isPrimary: true }],
        passengerCount: 1,
        fareEstimate: rideRequest.fare.estimated,
        routeName: route.name,
        planName: plan.name,
        isShuttleAssignment: true,
      });

      logger.info(`Shuttle ride ${rideRequest._id} sent directly to assigned driver ${route.assignedDriver.name} (route: ${route.name})`);
    } else {
      // No driver assigned to this route yet — fall back to generic geo-matching
      const bundleEngine = require('../services/BundleMatchingEngine');
      bundleEngine.processNewRideRequest(rideRequest._id).catch(err => {
        logger.error('Failed to dispatch subscription ride', { error: err.message });
      });
      logger.info(`No driver assigned to route ${route.name}; falling back to BundleMatchingEngine for ride ${rideRequest._id}`);
    }
  }

  logger.info(`Subscription activated for customer ${customer._id}`, {
    subscriptionId: subscription._id,
    paymentId,
  });

  return res.status(200).json(formatResponse('Payment verified. Subscription activated!', {
    subscriptionId: subscription._id,
    status: 'ACTIVE',
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
