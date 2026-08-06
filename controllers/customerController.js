const Customer = require('../models/Customer');
const Trip = require('../models/Trip');
const Subscription = require('../models/Subscription');
const PauseRequest = require('../models/PauseRequest');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
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
    'manifest.customer': customer._id,
    status: { $ne: 'CANCELLED' },
  };

  const [trips, total] = await Promise.all([
    Trip.find(filter)
      .populate('routeId', 'name startLocation endLocation stops')
      .populate('driverId', 'name vehicleNumber')
      .sort({ tripDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Trip.countDocuments(filter),
  ]);

  for (const trip of trips) {
    trip.myEntry = (trip.manifest || []).find((entry) => {
      if (!entry || !entry.customer) return false;
      const ref = typeof entry.customer === 'object' ? entry.customer._id : entry.customer;
      return ref && customer._id.equals(ref);
    });
  }

  return res.status(200).json(
    formatResponse('Trips retrieved successfully.', trips, {
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
    'manifest.customer': customer._id,
  })
    .populate('routeId')
    .populate('driverId', 'name vehicleNumber vehicleModel')
    .lean();

  if (!trip) {
    throw new NotFoundError('Trip not found.');
  }

  trip.myEntry = (trip.manifest || []).find((entry) => {
    if (!entry || !entry.customer) return false;
    const ref = typeof entry.customer === 'object' ? entry.customer._id : entry.customer;
    return ref && customer._id.equals(ref);
  });

  return res.status(200).json(formatResponse('Trip retrieved successfully.', trip));
});

const getSubscription = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) {
    throw new NotFoundError('Customer not found.');
  }

  const subscription = await Subscription.findOne({
    customerId: customer._id,
    status: { $ne: 'EXPIRED' },
  })
    .populate('planId')
    .populate('routeId', 'name startLocation endLocation stops');

  return res.status(200).json(formatResponse('Subscription retrieved successfully.', subscription));
});

const requestPause = asyncWrapper(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.user.id });
  if (!customer) {
    throw new NotFoundError('Customer not found.');
  }

  const subscription = await Subscription.findOne({
    customerId: customer._id,
    status: { $ne: 'EXPIRED' },
  }).populate('planId');

  if (!subscription) {
    throw new NotFoundError('No active subscription found.');
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
