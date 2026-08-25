const Customer = require('../models/Customer');
const Trip = require('../models/Trip');
const Subscription = require('../models/Subscription');
const PauseRequest = require('../models/PauseRequest');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { toTripView } = require('../utils/tripView');
const { NotFoundError, ValidationError } = require('../utils/AppError');

const getProfile = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id }).populate('subscriptionId');
  if (!customer) {
    throw new NotFoundError('Customer profile not found.');
  }

  const profile = {
    id: customer._id,
    name: customer.name,
    phone: req.user.phone,
    homeLocation: customer.homeLocation,
    pickupLocation: customer.pickupLocation,
    dropLocation: customer.dropLocation,
    subscription: customer.subscriptionId,
  };

  return res.status(200).json(formatResponse('Profile retrieved successfully.', profile));
});

const getTrips = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) {
    throw new NotFoundError('Customer not found.');
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter = {
    'passengers.customerId': customer._id,
    status: { $ne: 'CANCELLED' },
  };

  const [trips, total] = await Promise.all([
    Trip.find(filter)
      .populate('driverId', 'name vehicleNumber')
      .populate('passengers.customerId', 'name')
      .sort({ serviceDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Trip.countDocuments(filter),
  ]);

  const views = trips.map((trip) => toTripView(trip, { customerId: customer._id }));

  return res.status(200).json(
    formatResponse('Trips retrieved successfully.', views, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }),
  );
});

const getTripById = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) {
    throw new NotFoundError('Customer not found.');
  }

  const trip = await Trip.findOne({
    _id: req.params.id,
    'passengers.customerId': customer._id,
  })
    .populate('driverId', 'name vehicleNumber vehicleModel')
    .populate('passengers.customerId', 'name')
    .lean();

  if (!trip) {
    throw new NotFoundError('Trip not found.');
  }

  return res.status(200).json(formatResponse('Trip retrieved successfully.', toTripView(trip, { customerId: customer._id })));
});

/**
 * GET /api/v1/customer/subscription
 * The customer's primary subscription. Customers can hold several at once —
 * this reports the one Customer.subscriptionId points at (falling back to the
 * newest live one) and carries the rest in `otherSubscriptions` so callers can
 * tell there are more. GET /customer/subscriptions returns the full list.
 */
const getSubscription = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) {
    throw new NotFoundError('Customer not found.');
  }

  const subscriptions = await Subscription.find({
    customerId: customer._id,
    status: { $in: ['ACTIVE', 'PAUSED', 'PENDING_PAYMENT'] },
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .populate('planId')
    .populate('routeId', 'name startLocation endLocation stops');

  if (subscriptions.length === 0) {
    return res.status(200).json(formatResponse('Subscription retrieved successfully.', null));
  }

  const pointed = customer.subscriptionId
    ? subscriptions.find((s) => s._id.equals(customer.subscriptionId))
    : null;
  const primary = pointed || subscriptions[0];

  return res.status(200).json(formatResponse('Subscription retrieved successfully.', {
    ...primary.toObject(),
    subscriptionCount: subscriptions.length,
    otherSubscriptions: subscriptions.filter((s) => !s._id.equals(primary._id)),
  }));
});

/**
 * POST /api/v1/customer/pause-request
 * Body: { date, subscriptionId } — `subscriptionId` is required once more than
 * one subscription is live, since a pause applies to one commute only.
 */
const requestPause = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) {
    throw new NotFoundError('Customer not found.');
  }

  const pausable = await Subscription.find({
    customerId: customer._id,
    status: { $in: ['ACTIVE', 'PAUSED'] },
    isDeleted: false,
  })
    .sort({ pickupTime: 1, createdAt: 1 })
    .populate('planId');

  if (pausable.length === 0) {
    throw new NotFoundError('No active subscription found.');
  }

  let subscription;
  if (req.body.subscriptionId) {
    subscription = pausable.find((s) => s._id.equals(req.body.subscriptionId));
    if (!subscription) throw new NotFoundError('No active subscription found.');
  } else if (pausable.length > 1) {
    throw new ValidationError(
      `You have ${pausable.length} active subscriptions. Say which one to pause.`,
      {
        code: 'SUBSCRIPTION_ID_REQUIRED',
        subscriptions: pausable.map((s) => ({
          _id: s._id,
          subscriptionType: s.subscriptionType,
          pickupTime: s.pickupTime,
          scheduleDays: s.scheduleDays,
        })),
      }
    );
  } else {
    [subscription] = pausable;
  }

  if (!subscription.planId || subscription.planId.pauseDaysAllowed <= 0) {
    throw new ValidationError('Pause requests are not available for this plan.');
  }

  if (subscription.remainingPauseDays <= 0) {
    throw new ValidationError('No remaining pause days available.');
  }

  // Prevent duplicate pending pause requests for the same date
  const requestedDate = req.body.date || new Date();
  const existingRequest = await PauseRequest.findOne({
    customerId: customer._id,
    subscriptionId: subscription._id,
    requestedDate,
    status: 'PENDING',
  });
  if (existingRequest) {
    throw new ValidationError('A pause request for this date is already pending.');
  }

  const pauseRequest = await PauseRequest.create({
    customerId: customer._id,
    subscriptionId: subscription._id,
    requestedDate: req.body.date || new Date(),
    status: 'PENDING',
  });

  const { publishCustomerOperation } = require('../services/customerOperationService');
  await publishCustomerOperation({
    type: 'PAUSE_REQUESTED',
    customerId: customer._id,
    title: 'Customer requested a subscription pause',
    summary: `Pause requested from ${new Date(pauseRequest.requestedDate).toLocaleDateString('en-IN')}.`,
    metadata: { pauseRequestId: pauseRequest._id.toString(), subscriptionId: subscription._id.toString() },
  });

  return res.status(201).json(formatResponse('Pause request submitted successfully.', pauseRequest));
});

const updateProfile = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) {
    throw new NotFoundError('Customer not found.');
  }

  const { homeLocation, pickupLocation, dropLocation } = req.body;

  const validateLocation = (loc, fieldName) => {
    if (loc === undefined || loc === null) return;
    if (typeof loc !== 'object') throw new ValidationError(`${fieldName} must be an object`);
    if (typeof loc.address !== 'string' || !loc.address.trim()) {
      throw new ValidationError(`${fieldName}.address must be a non-empty string`);
    }
    if (!Array.isArray(loc.coordinates) || loc.coordinates.length !== 2 ||
        typeof loc.coordinates[0] !== 'number' || typeof loc.coordinates[1] !== 'number') {
      throw new ValidationError(`${fieldName}.coordinates must be an array of 2 numbers`);
    }
    if (loc.type !== undefined && loc.type !== 'Point') {
      throw new ValidationError(`${fieldName}.type must be "Point"`);
    }
  };

  validateLocation(homeLocation, 'homeLocation');
  validateLocation(pickupLocation, 'pickupLocation');
  validateLocation(dropLocation, 'dropLocation');

  if (homeLocation !== undefined) {
    customer.homeLocation = homeLocation;
  }

  if (pickupLocation !== undefined) {
    customer.pickupLocation = pickupLocation;
  }

  if (dropLocation !== undefined) {
    customer.dropLocation = dropLocation;
  }

  const updatedCustomer = await customer.save();

  const profile = {
    id: updatedCustomer._id,
    name: updatedCustomer.name,
    phone: req.user.phone,
    homeLocation: updatedCustomer.homeLocation,
    pickupLocation: updatedCustomer.pickupLocation,
    dropLocation: updatedCustomer.dropLocation,
    subscription: updatedCustomer.subscriptionId,
  };

  return res.status(200).json(formatResponse('Profile updated successfully.', profile));
});

module.exports = {
  getProfile,
  updateProfile,
  getTrips,
  getTripById,
  getSubscription,
  requestPause,
};
