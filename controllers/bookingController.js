/**
 * bookingController — Per PDF section 6 (Customer Booking)
 *
 * Customer enters: pickup location, drop location, selected days, pickup time, subscription type.
 * Backend converts to coordinates and runs the matching engine.
 *
 * This replaces the old route-stop-based subscription purchase for the
 * Weekday/Hybrid models. Flexy remains as the on-demand Socket.IO flow.
 */

const Customer = require('../models/Customer');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const { matchSubscription, assignDriverToSubscription } = require('../services/SubscriptionMatchingService');
const { offerTripToDriver } = require('../services/TripAssignmentService');
const { generateTripsForDate } = require('../services/DailyTripGenerator');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { NotFoundError, ValidationError } = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * POST /api/v1/customer/book
 * Customer creates a subscription booking.
 * Body: { planId, subscriptionType, pickupLocation, dropLocation, scheduleDays, pickupTime, startDate }
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

  // Validate required fields
  if (!subscriptionType || !['WEEKDAYS', 'HYBRID'].includes(subscriptionType)) {
    throw new ValidationError('Subscription type must be WEEKDAYS or HYBRID.');
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
  if (subscriptionType === 'WEEKDAYS') {
    // Auto-set Mon-Fri (PDF section 5)
    normalizedDays = [1, 2, 3, 4, 5];
  } else if (subscriptionType === 'HYBRID') {
    // Customer picks their days (PDF section 5)
    if (!scheduleDays || !Array.isArray(scheduleDays) || scheduleDays.length === 0) {
      throw new ValidationError('For HYBRID, select at least one day.');
    }
    // Validate days are valid weekday numbers
    normalizedDays = scheduleDays.filter((d) => d >= 0 && d <= 6);
    if (normalizedDays.length === 0) {
      throw new ValidationError('Invalid schedule days. Use 0=Sun through 6=Sat.');
    }
  }

  // Load plan
  const plan = await Plan.findOne({ _id: planId, isActive: true, isDeleted: false });
  if (!plan) throw new NotFoundError('Plan');

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
  if (start < today) {
    throw new ValidationError('Start date cannot be in the past.');
  }
  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + (plan.durationDays || 30));

  // Create subscription
  const subscription = await Subscription.create({
    customerId: customer._id,
    planId: plan._id,
    subscriptionType,
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
    remainingPauseDays: plan.pauseDaysAllowed || 0,
    status: 'ACTIVE', // Skip payment for now (or integrate Razorpay later)
    payment: { amount: plan.price, status: 'completed', paidAt: new Date() },
  });

  // Run matching engine (PDF section 24: Customer books → Matching Engine)
  const matchResult = await matchSubscription(subscription);

  if (matchResult.success) {
    // Assign the matched driver
    await assignDriverToSubscription(subscription._id, matchResult.driver._id, matchResult.area._id);

    // Generate trips for upcoming service days (next 7 days)
    const tripsGenerated = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      if (normalizedDays.includes(date.getDay())) {
        const result = await generateTripsForDate(date);
        if (result.createdTrips > 0) tripsGenerated.push(date.toISOString().split('T')[0]);
      }
    }

    logger.info('[Booking] Subscription created and matched', {
      subscriptionId: subscription._id,
      driverId: matchResult.driver._id,
      driverName: matchResult.driver.name,
      distanceKm: matchResult.distanceKm,
      tripsGenerated,
    });

    return res.status(201).json(formatResponse('Subscription created successfully. Driver assigned.', {
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
      },
      assignment: {
        driver: {
          _id: matchResult.driver._id,
          name: matchResult.driver.name,
          vehicleNumber: matchResult.driver.vehicleNumber,
          vehicleModel: matchResult.driver.vehicleModel,
          vehicleCapacity: matchResult.driver.vehicleCapacity,
        },
        area: matchResult.area?.name,
        distanceKm: Math.round(matchResult.distanceKm * 10) / 10,
        remainingCapacity: matchResult.remainingCapacity,
      },
      tripsGenerated,
    }));
  }

  // No driver matched — subscription is active but unassigned (admin can manually assign)
  logger.warn('[Booking] Subscription created but no driver matched', {
    subscriptionId: subscription._id,
    reason: matchResult.reason,
  });

  return res.status(201).json(formatResponse('Subscription created. No driver available yet — admin will assign one.', {
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
    },
    assignment: null,
    reason: matchResult.reason,
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

  // Update locations
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

  // Re-evaluate driver assignment (PDF section 19)
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

module.exports = {
  createBooking,
  getMyBooking,
  cancelBooking,
  updateLocation,
};
