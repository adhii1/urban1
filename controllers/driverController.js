const Driver = require('../models/Driver');
const Trip = require('../models/Trip');
const Customer = require('../models/Customer');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { toTripView } = require('../utils/tripView');
const { NotFoundError, ValidationError } = require('../utils/AppError');

const getProfile = asyncWrapper(async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id }).populate('routeId');
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const profile = {
    id: driver._id,
    name: driver.name,
    phone: req.user.phone,
    vehicleNumber: driver.vehicleNumber,
    vehicleModel: driver.vehicleModel,
    vehicleCapacity: driver.vehicleCapacity,
    licenseNumber: driver.licenseNumber,
    route: driver.routeId,
    status: driver.status,
  };

  return res.status(200).json(formatResponse('Driver profile retrieved.', profile));
});

const getTrips = asyncWrapper(async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const scope = req.query.scope || 'today';

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const startOfNextDay = new Date(startOfDay);
  startOfNextDay.setDate(startOfNextDay.getDate() + 1);

  const filter = {
    driverId: driver._id,
    status: { $ne: 'CANCELLED' },
  };

  if (scope === 'today') {
    filter.serviceDate = { $gte: startOfDay, $lt: startOfNextDay };
  } else if (scope === 'upcoming') {
    filter.serviceDate = { $gte: startOfDay };
    filter.status = 'SCHEDULED';
  }
  // scope === 'all' uses no date filter

  const [tripDocs, total] = await Promise.all([
    Trip.find(filter)
      .populate('passengers.customerId', 'name')
      .sort({ serviceDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Trip.countDocuments(filter),
  ]);
  const trips = tripDocs.map((t) => toTripView(t));

  // Also get pending/accepted ride requests assigned to this driver
  const RideRequest = require('../models/RideRequest');
  const activeRides = await RideRequest.find({
    acceptedDriverId: driver._id,
    status: { $in: ['ACCEPTED', 'DRIVER_ARRIVING', 'IN_PROGRESS'] },
    isDeleted: false,
  }).sort({ createdAt: -1 }).lean();

  // Also get pending offers (rides that matched this driver but not yet accepted)
  const pendingOffers = await RideRequest.find({
    'matchedDrivers.driverId': driver._id,
    status: 'PENDING',
    isDeleted: false,
  }).sort({ createdAt: -1 }).limit(10).lean();

  // Convert rides to trip-like format for the frontend
  const rideAsTrips = [...activeRides, ...pendingOffers].map(r => ({
    _id: r._id,
    type: 'RIDE',
    status: r.status,
    serviceDate: r.requestedAt || r.createdAt,
    tripDate: r.requestedAt || r.createdAt,
    pickup: r.pickupLocation,
    drop: r.dropLocation,
    customerName: r.customerName,
    fare: r.fare,
    manifest: [{ customer: { name: r.customerName || 'Customer' }, status: r.status === 'COMPLETED' ? 'DROPPED' : 'PENDING' }],
  }));

  const allTrips = [...rideAsTrips, ...trips];

  return res.status(200).json(
    formatResponse("Driver's trips retrieved.", allTrips, {
      page,
      limit,
      total: total + rideAsTrips.length,
      totalPages: Math.ceil((total + rideAsTrips.length) / limit),
    }),
  );
});

// Get driver earnings summary
const getEarnings = asyncWrapper(async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const period = req.query.period || 'today'; // today, week, month, all
  const now = new Date();
  let startDate;

  if (period === 'today') {
    startDate = new Date(now.setHours(0, 0, 0, 0));
  } else if (period === 'week') {
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 7);
  } else if (period === 'month') {
    startDate = new Date(now);
    startDate.setMonth(now.getMonth() - 1);
  } else {
    startDate = new Date(0); // all time
  }

  // Get completed trips in the period
  const completedTrips = await Trip.find({
    driverId: driver._id,
    status: 'COMPLETED',
    completedAt: { $gte: startDate },
  }).lean();

  // Also count completed on-demand rides (RideRequest)
  const RideRequest = require('../models/RideRequest');
  const completedRides = await RideRequest.find({
    acceptedDriverId: driver._id,
    status: 'COMPLETED',
    completedAt: { $gte: startDate },
    isDeleted: false,
  }).lean();

  // Calculate total earnings from completed rides
  let totalEarnings = 0;
  let totalTrips = completedTrips.length + completedRides.length;
  let totalDistance = 0;
  let totalDuration = 0;

  completedTrips.forEach(trip => {
    if (trip.fare?.final) totalEarnings += trip.fare.final;
    if (trip.fare?.details?.distanceKm) totalDistance += trip.fare.details.distanceKm;
    if (trip.startedAt && trip.completedAt) {
      totalDuration += (new Date(trip.completedAt) - new Date(trip.startedAt)) / (1000 * 60);
    }
  });

  completedRides.forEach(ride => {
    const fare = ride.fare?.final || ride.fare?.estimated || 0;
    totalEarnings += fare;
    if (ride.fare?.details?.distanceKm) totalDistance += ride.fare.details.distanceKm;
    if (ride.pickupAt && ride.completedAt) {
      totalDuration += (new Date(ride.completedAt) - new Date(ride.pickupAt)) / (1000 * 60);
    }
  });

  return res.status(200).json(
    formatResponse('Driver earnings retrieved.', {
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      totalTrips,
      totalDistance: Math.round(totalDistance * 100) / 100,
      totalDuration: Math.round(totalDuration),
      period,
    }),
  );
});

const getTripById = asyncWrapper(async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const trip = await Trip.findOne({
    _id: req.params.id,
    driverId: driver._id,
  })
    .populate('passengers.customerId', 'name pickupLocation dropLocation')
    .lean();

  if (!trip) {
    throw new NotFoundError('Trip');
  }

  return res.status(200).json(formatResponse('Trip retrieved.', toTripView(trip)));
});

const getTripCustomers = asyncWrapper(async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const trip = await Trip.findOne({
    _id: req.params.id,
    driverId: driver._id,
  })
    .populate({
      path: 'passengers.customerId',
      select: 'name',
      populate: { path: 'userId', select: 'phone' },
    })
    .lean();

  if (!trip) {
    throw new NotFoundError('Trip');
  }

  const view = toTripView(trip);
  return res.status(200).json(formatResponse('Trip customers retrieved.', view.passengers));
});

const emitTripLifecycle = async (trip, event, customerId) => {
  const passengers = trip.passengers || [];
  const customerIds = customerId
    ? [customerId]
    : passengers.map((entry) => entry.customerId).filter(Boolean);

  if (!customerIds.length) return;

  try {
    const customers = await Customer.find({ _id: { $in: customerIds } })
      .select('_id userId')
      .lean();
    const basePayload = {
      tripId: trip._id.toString(),
      status: trip.status,
      event,
      updatedAt: new Date().toISOString(),
    };
    const { getIO, emitToUser } = require('../config/socket');

    getIO().of('/sockets/admin').emit('trip:update', basePayload);
    for (const customer of customers) {
      const entry = passengers.find((item) => item.customerId?.toString() === customer._id.toString());
      emitToUser('customer', customer.userId.toString(), 'trip:update', {
        ...basePayload,
        passengerStatus: entry?.status,
      });
    }
  } catch {
    // Realtime delivery is best-effort; the persisted trip state remains authoritative.
  }
};

const startTrip = asyncWrapper(async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const trip = await Trip.findOne({
    _id: req.params.id,
    driverId: driver._id,
  });

  if (!trip) {
    throw new NotFoundError('Trip');
  }

  if (trip.status !== 'SCHEDULED') {
    throw new ValidationError('Trip can only be started from SCHEDULED status.');
  }

  trip.status = 'IN_PROGRESS';
  trip.startedAt = new Date();
  await trip.save();
  await emitTripLifecycle(trip, 'STARTED');

  return res.status(200).json(formatResponse('Trip started.', trip));
});

const completeTrip = asyncWrapper(async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const trip = await Trip.findOne({
    _id: req.params.id,
    driverId: driver._id,
  });

  if (!trip) {
    throw new NotFoundError('Trip');
  }

  if (trip.status !== 'IN_PROGRESS') {
    throw new ValidationError('Trip can only be completed from IN_PROGRESS status.');
  }

  const boardedNotDropped = (trip.passengers || []).filter((p) => ['RIDE_STARTED', 'DROPPING_OFF'].includes(p.status));
  if (boardedNotDropped.length > 0) {
    throw new ValidationError('All boarded passengers must be dropped off before completing the trip.');
  }

  for (const p of trip.passengers || []) {
    if (!['COMPLETED', 'NO_SHOW'].includes(p.status)) {
      p.status = 'NO_SHOW';
    }
  }

  trip.status = 'COMPLETED';
  trip.completedAt = new Date();
  await trip.save();
  await emitTripLifecycle(trip, 'COMPLETED');

  return res.status(200).json(formatResponse('Trip completed.', trip));
});

// Canonical per-passenger transitions on trip.passengers[]. OTP verification
// (PDF section 15) is enforced on verify-otp, and optionally on board.
const PASSENGER_TRANSITIONS = {
  'verify-otp': { from: ['ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED'], to: 'OTP_VERIFIED', requiresOtp: true },
  board: { from: ['ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'OTP_VERIFIED'], to: 'RIDE_STARTED', timestamp: 'boardedAt' },
  drop: { from: ['RIDE_STARTED', 'DROPPING_OFF'], to: 'COMPLETED', timestamp: 'droppedAt' },
  'no-show': { from: ['ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'OTP_VERIFIED'], to: 'NO_SHOW' },
};

const updateManifestStatus = asyncWrapper(async (req, res) => {
  const transition = PASSENGER_TRANSITIONS[req.params.action];
  if (!transition) {
    throw new ValidationError('Unsupported passenger action.');
  }

  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const trip = await Trip.findOne({
    _id: req.params.id,
    driverId: driver._id,
  });

  if (!trip) {
    throw new NotFoundError('Trip');
  }

  if (trip.status !== 'IN_PROGRESS') {
    throw new ValidationError('Passenger status can only be updated while the trip is IN_PROGRESS.');
  }

  const entry = (trip.passengers || []).find(
    (p) => p.customerId && p.customerId.toString() === req.params.customerId
  );
  if (!entry) {
    throw new NotFoundError('Passenger in trip');
  }

  if (transition.from && !transition.from.includes(entry.status)) {
    throw new ValidationError(`Passenger cannot be marked ${transition.to} from ${entry.status}.`);
  }

  // OTP is required for verify-otp, and honored on board when supplied.
  if (transition.requiresOtp || (req.params.action === 'board' && req.body?.otp != null)) {
    const provided = String(req.body?.otp || '').trim();
    if (!provided || provided !== entry.otp?.code) {
      throw new ValidationError('Incorrect OTP for this passenger.');
    }
    entry.otp.verified = true;
  }

  entry.status = transition.to;
  if (transition.timestamp) {
    entry[transition.timestamp] = new Date();
  }

  await trip.save();
  await emitTripLifecycle(trip, `PASSENGER_${transition.to}`, entry.customerId);

  const updated = await Trip.findById(trip._id)
    .populate('passengers.customerId', 'name pickupLocation dropLocation')
    .lean();

  return res.status(200).json(formatResponse(`Passenger marked ${transition.to}.`, toTripView(updated)));
});

module.exports = {
  getProfile,
  getTrips,
  getEarnings,
  getTripById,
  getTripCustomers,
  startTrip,
  completeTrip,
  updateManifestStatus,
};
