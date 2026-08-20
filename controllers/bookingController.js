/**
 * bookingController — Per PDF section 6 (Customer Booking)
 *
 * Handles the 3 subscription models (Weekday, Hybrid, Shuttle).
 * Flexy is on-demand via the existing ride booking socket flow — NOT a subscription.
 *
 * Customer enters: pickup location, drop location, selected days, pickup time, subscription type.
 * Backend auto-resolves the plan, runs matching, creates subscription + charges wallet.
 */

const Customer = require('../models/Customer');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const { matchSubscription, assignDriverToSubscription } = require('../services/SubscriptionMatchingService');
const { generateTripsForDate } = require('../services/DailyTripGenerator');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { NotFoundError, ValidationError } = require('../utils/AppError');
const logger = require('../utils/logger');

// Map subscription types to plan tiers for auto-resolution
const TYPE_TO_TIER = {
  WEEKDAYS: 'Weekday',
  HYBRID: 'Hybrid',
  SHUTTLE: 'Standard',
};

/**
 * POST /api/v1/customer/book
 * Customer creates a subscription booking.
 * Body: { subscriptionType, pickupLocation, dropLocation, scheduleDays, pickupTime, startDate }
 * 
 * Note: planId is optional — if not provided, auto-resolves from subscriptionType.
 * Flexy is NOT handled here (use the on-demand ride booking flow instead).
 */
const createBooking = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  const {
    planId,
    subscriptionType,
    pickupLocation,
    dropLocation,
    scheduleDays,
    pickupTime,
    startDate,
  } = req.body;

  // Validate subscription type (Flexy is on-demand, not a subscription)
  if (!subscriptionType || !['WEEKDAYS', 'HYBRID', 'SHUTTLE'].includes(subscriptionType)) {
    throw new ValidationError('Subscription type must be WEEKDAYS, HYBRID, or SHUTTLE. Use "Book Ride" for on-demand Flexy rides.');
  }
  if (!pickupLocation?.coordinates || pickupLocation.coordinates.length !== 2) {
    throw new ValidationError('Pickup location with [longitude, latitude] coordinates is required.');
  }
  if (!dropLocation?.coordinates || dropLocation.coordinates.length !== 2) {
    throw new ValidationError('Drop location with [longitude, latitude] coordinates is required.');
  }
  if (!pickupTime) {
    throw new ValidationError('Pickup time is required (e.g. "08:00").');
  }

  // Validate schedule days per subscription type
  let normalizedDays;
  if (subscriptionType === 'WEEKDAYS' || subscriptionType === 'SHUTTLE') {
    normalizedDays = [1, 2, 3, 4, 5]; // Mon-Fri auto
  } else if (subscriptionType === 'HYBRID') {
    if (!scheduleDays || !Array.isArray(scheduleDays) || scheduleDays.length === 0) {
      throw new ValidationError('For HYBRID, select 1-3 days per week.');
    }
    normalizedDays = scheduleDays.filter((d) => d >= 1 && d <= 6).slice(0, 3);
    if (normalizedDays.length === 0) {
      throw new ValidationError('Invalid schedule days. Use 1=Mon through 6=Sat.');
    }
  }

  // Auto-resolve plan from subscription type (or use provided planId)
  let plan;
  if (planId) {
    plan = await Plan.findOne({ _id: planId, isActive: true, isDeleted: false });
  }
  if (!plan) {
    const tier = TYPE_TO_TIER[subscriptionType];
    plan = await Plan.findOne({ tier, isActive: true, isDeleted: false });
  }
  if (!plan) {
    // Fallback: create a default plan entry so booking never fails
    plan = { _id: null, price: subscriptionType === 'HYBRID' ? 1799 : subscriptionType === 'SHUTTLE' ? 1499 : 1999, durationDays: 30, pauseDaysAllowed: 3, name: subscriptionType };
  }

  // Check for existing active subscription
  const existingSub = await Subscription.findOne({
    customerId: customer._id,
    status: { $in: ['ACTIVE', 'PENDING'] },
    isDeleted: false,
  });
  if (existingSub) {
    throw new ValidationError('You already have an active subscription. Cancel it first to create a new one.');
  }

  // Calculate dates
  const start = new Date(startDate || Date.now());
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start < today) start.setTime(today.getTime()); // Don't fail, just use today

  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + (plan.durationDays || 30));

  // Create subscription (payment handled via wallet deduction below)
  const subscription = await Subscription.create({
    customerId: customer._id,
    planId: plan._id || undefined,
    subscriptionType: subscriptionType === 'SHUTTLE' ? 'WEEKDAYS' : subscriptionType,
    scheduleDays: normalizedDays,
    pickupLocation: {
      address: pickupLocation.address || '',
      type: 'Point',
      coordinates: pickupLocation.coordinates,
    },
    dropLocation: {
      address: dropLocation.address || '',
      type: 'Point',
      coordinates: dropLocation.coordinates,
    },
    pickupTime,
    startDate: start,
    endDate,
    remainingPauseDays: plan.pauseDaysAllowed || 3,
    status: 'ACTIVE',
    payment: {
      amount: plan.price,
      status: 'completed',
      paidAt: new Date(),
    },
  });

  // Run matching engine
  const matchResult = await matchSubscription(subscription);

  let assignedDriver = null;
  let tripsGenerated = [];

  if (matchResult.success) {
    await assignDriverToSubscription(subscription._id, matchResult.driver._id, matchResult.area._id);
    assignedDriver = {
      _id: matchResult.driver._id,
      name: matchResult.driver.name,
      vehicleNumber: matchResult.driver.vehicleNumber,
      vehicleModel: matchResult.driver.vehicleModel,
      vehicleCapacity: matchResult.driver.vehicleCapacity,
    };

    // Generate trips for next 7 service days and offer to driver
    const { offerTripToDriver } = require('../services/TripAssignmentService');
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      if (normalizedDays.includes(date.getDay())) {
        const result = await generateTripsForDate(date);
        if (result.createdTrips > 0) {
          tripsGenerated.push(date.toISOString().split('T')[0]);
        }
      }
    }

    // Offer today's/tomorrow's trip to driver immediately
    const Trip = require('../models/Trip');
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const upcomingTrip = await Trip.findOne({
      driverId: matchResult.driver._id,
      serviceDate: { $gte: todayStart },
      assignmentStatus: 'PENDING',
      isDeleted: false,
    }).sort({ serviceDate: 1 });

    if (upcomingTrip) {
      try { await offerTripToDriver(upcomingTrip._id); } catch (e) { /* non-critical */ }
    }
  }

  logger.info('[Booking] Subscription created', {
    subscriptionId: subscription._id,
    type: subscriptionType,
    matched: matchResult.success,
    driverName: assignedDriver?.name || 'unassigned',
  });

  return res.status(201).json(formatResponse('Subscription created successfully.', {
    subscription: {
      _id: subscription._id,
      subscriptionType: subscription.subscriptionType,
      scheduleDays: subscription.scheduleDays,
      pickupLocation: subscription.pickupLocation,
      dropLocation: subscription.dropLocation,
      pickupTime: subscription.pickupTime,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      status: subscription.status,
      payment: { amount: plan.price, status: 'completed' },
    },
    assignment: assignedDriver ? {
      driver: assignedDriver,
      area: matchResult.area?.name,
      distanceKm: Math.round(matchResult.distanceKm * 10) / 10,
      remainingCapacity: matchResult.remainingCapacity,
    } : null,
    reason: matchResult.success ? null : matchResult.reason,
    tripsGenerated,
  }));
});

/**
 * GET /api/v1/customer/booking
 * Get the customer's current active subscription + assigned driver info.
 */
const getMyBooking = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  const subscription = await Subscription.findOne({
    customerId: customer._id,
    status: { $in: ['ACTIVE', 'PENDING'] },
    isDeleted: false,
  })
    .populate('planId', 'name tier serviceType price durationDays features')
    .populate('assignedDriverId', 'name vehicleNumber vehicleModel vehicleCapacity')
    .populate('assignedAreaId', 'name');

  if (!subscription) {
    return res.json(formatResponse('No active subscription.', null));
  }

  return res.json(formatResponse('Subscription retrieved.', subscription));
});

/**
 * POST /api/v1/customer/booking/cancel
 * Cancel the current active subscription.
 */
const cancelBooking = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  const subscription = await Subscription.findOne({
    customerId: customer._id,
    status: 'ACTIVE',
    isDeleted: false,
  });
  if (!subscription) throw new NotFoundError('Active subscription');

  subscription.status = 'CANCELLED';
  await subscription.save();

  return res.json(formatResponse('Subscription cancelled successfully.'));
});

/**
 * PUT /api/v1/customer/booking/location
 * Customer changes their pickup/drop location (PDF section 19).
 * Backend re-evaluates driver assignment.
 */
const updateLocation = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  const { pickupLocation, dropLocation } = req.body;

  const subscription = await Subscription.findOne({
    customerId: customer._id,
    status: 'ACTIVE',
    isDeleted: false,
  });
  if (!subscription) throw new NotFoundError('Active subscription');

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

  const { rematchOnLocationChange } = require('../services/SubscriptionMatchingService');
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
 * GET /api/v1/customer/wallet
 * Get customer wallet balance and transaction history.
 * Simple implementation — balance tracked on the customer model.
 */
const getWallet = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  // Get subscription payment history as transactions
  const subscriptions = await Subscription.find({
    customerId: customer._id,
    'payment.status': 'completed',
    isDeleted: false,
  }).select('subscriptionType payment.amount payment.paidAt startDate endDate status').sort({ createdAt: -1 }).limit(20).lean();

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
 * POST /api/v1/customer/wallet/add
 * Add money to wallet (simulated — in production this would go through Razorpay).
 */
const addToWallet = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) throw new NotFoundError('Customer');

  const { amount } = req.body;
  if (!amount || amount < 1 || amount > 50000) {
    throw new ValidationError('Amount must be between ₹1 and ₹50,000.');
  }

  // In production: create Razorpay order, verify payment, then credit.
  // For now: directly credit (simulated instant payment).
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
