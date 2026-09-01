const Driver = require('../models/Driver');
const Trip = require('../models/Trip');
const Customer = require('../models/Customer');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { toTripView } = require('../utils/tripView');
const { NotFoundError, ValidationError } = require('../utils/AppError');

/**
 * Populate specs shared by every driver-facing trip read.
 *
 * Both rider collections have to be populated. `passengers.customerId` covers
 * area-based (subscription) trips and `manifest.customer` covers route-based
 * ones; populating only the first is why route-based trips reached the driver
 * with no identifiable riders at all.
 */
const RIDER_POPULATE = [
  {
    path: 'passengers.customerId',
    select: 'name userId pickupLocation dropLocation',
    populate: { path: 'userId', select: 'phone' },
  },
  {
    path: 'manifest.customer',
    select: 'name userId pickupLocation dropLocation',
    populate: { path: 'userId', select: 'phone' },
  },
];

const getProfile = asyncWrapper(async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id }).populate('routeId');
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  // The profile card reports a lifetime completed-trip count. Both trip
  // generations count: scheduled Trips and accepted on-demand RideRequests.
  const RideRequestModel = require('../models/RideRequest');
  const [completedTrips, completedRides] = await Promise.all([
    Trip.countDocuments({ driverId: driver._id, status: 'COMPLETED' }),
    RideRequestModel.countDocuments({
      acceptedDriverId: driver._id,
      status: 'COMPLETED',
      isDeleted: false,
    }),
  ]);

  const profile = {
    id: driver._id,
    userId: driver.userId,
    name: driver.name,
    phone: req.user.phone,
    vehicleNumber: driver.vehicleNumber,
    vehicleModel: driver.vehicleModel,
    vehicleCapacity: driver.vehicleCapacity,
    licenseNumber: driver.licenseNumber,
    route: driver.routeId,
    status: driver.status,
    isOnline: driver.isOnline,
    isAvailable: driver.isAvailable,
    // The sidebar/navbar widget reads `rating` and renders it with toFixed(2);
    // sending the field it actually reads (rather than omitting it and letting
    // the widget throw mid-update) is what keeps the driver's own name on screen.
    rating: driver.averageRating || 0,
    totalRatings: driver.totalRatings || 0,
    completedTrips: completedTrips + completedRides,
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

  const tripQuery = Trip.find(filter);
  RIDER_POPULATE.forEach((spec) => tripQuery.populate(spec));

  const [tripDocs, total] = await Promise.all([
    tripQuery
      .populate('routeId')
      .sort({ serviceDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Trip.countDocuments(filter),
  ]);
  const trips = tripDocs.map((t) => toTripView(t, { viewer: 'driver' }));

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

  const rides = [...activeRides, ...pendingOffers];

  // `customerName` is denormalized onto the ride at creation time, but rides
  // created before that field existed (or through a path that never resolved
  // the socket's customer name) carry nothing. Resolve those from the Customer
  // record rather than shipping a literal 'Customer' the driver cannot act on.
  const unnamedRideUserIds = rides
    .filter((r) => !String(r.customerName || '').trim())
    .map((r) => r.customerId)
    .filter(Boolean);

  const customersByUserId = new Map();
  if (unnamedRideUserIds.length > 0) {
    const resolved = await Customer.find({ userId: { $in: unnamedRideUserIds } })
      .select('name userId')
      .populate('userId', 'phone')
      .lean();
    for (const c of resolved) {
      customersByUserId.set(String(c.userId?._id || c.userId), c);
    }
  }

  // Convert rides to trip-like format for the frontend
  const rideAsTrips = rides.map((r) => {
    const resolved = customersByUserId.get(String(r.customerId));
    const riderName = String(r.customerName || '').trim() || resolved?.name || null;
    const riderPhone = r.customerPhone || resolved?.userId?.phone || null;
    const legacyStatus = r.status === 'COMPLETED' ? 'DROPPED'
      : r.status === 'IN_PROGRESS' ? 'BOARDED'
        : 'PENDING';

    const entry = {
      rideRequestId: r._id,
      customerId: r.customerId,
      customer: riderName ? { _id: r.customerId, name: riderName } : r.customerId,
      passengerName: riderName,
      passengerPhone: riderPhone,
      pickupLocation: r.pickupLocation,
      dropLocation: r.dropLocation,
      status: legacyStatus,
      canonicalStatus: r.status,
      lifecycle: r.passengerLifecycle || legacyStatus,
      shuttleSessionId: r.shuttleSessionId || null,
      // The driver is the party that types this code in, so it stays visible here.
      otp: r.otp ? { code: r.otp.code, verified: Boolean(r.otp.verified) } : undefined,
    };

    return {
      _id: r._id,
      type: 'RIDE',
      status: r.status,
      serviceDate: r.requestedAt || r.createdAt,
      tripDate: r.requestedAt || r.createdAt,
      pickup: r.pickupLocation,
      drop: r.dropLocation,
      customerName: riderName,
      customerPhone: riderPhone,
      shuttleSessionId: r.shuttleSessionId || null,
      fare: r.fare,
      passengers: [entry],
      manifest: [entry],
    };
  });

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

  const tripQuery = Trip.findOne({
    _id: req.params.id,
    driverId: driver._id,
  });
  RIDER_POPULATE.forEach((spec) => tripQuery.populate(spec));

  const trip = await tripQuery.populate('routeId').lean();

  if (!trip) {
    throw new NotFoundError('Trip');
  }

  return res.status(200).json(formatResponse('Trip retrieved.', toTripView(trip, { viewer: 'driver' })));
});

const getTripCustomers = asyncWrapper(async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const tripQuery = Trip.findOne({
    _id: req.params.id,
    driverId: driver._id,
  });
  RIDER_POPULATE.forEach((spec) => tripQuery.populate(spec));

  const trip = await tripQuery.lean();

  if (!trip) {
    throw new NotFoundError('Trip');
  }

  const view = toTripView(trip, { viewer: 'driver' });
  // Route-based trips carry their riders in `manifest`, area-based ones in
  // `passengers`; return whichever is populated so this never answers with an
  // empty list for a trip that does have riders.
  const riders = view.passengers.length > 0 ? view.passengers : view.manifest;
  return res.status(200).json(formatResponse('Trip customers retrieved.', riders));
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

/**
 * PUT /api/v1/driver/trips/status   Body: { tripId, status }
 *
 * The driver app drives a trip through ARRIVING -> ARRIVED -> STARTED ->
 * COMPLETED and has always called this endpoint, but it was never mounted: every
 * "Mark arrived" / "Start trip" / "Complete trip" tap returned 404, so a trip
 * could not reach IN_PROGRESS and no passenger action (including OTP boarding)
 * was ever reachable.
 *
 * ARRIVING and ARRIVED are per-passenger facts in the canonical model — a shared
 * trip has many pickups — so they advance the pending riders rather than the
 * trip row. STARTED and COMPLETED are trip-level and reuse the same guards as
 * the PATCH endpoints.
 */
const DRIVER_APP_TRIP_STATUSES = {
  ARRIVING: { passengerFrom: ['ASSIGNED'], passengerTo: 'DRIVER_EN_ROUTE' },
  DRIVER_ARRIVING: { passengerFrom: ['ASSIGNED'], passengerTo: 'DRIVER_EN_ROUTE' },
  ARRIVED: { passengerFrom: ['ASSIGNED', 'DRIVER_EN_ROUTE'], passengerTo: 'DRIVER_ARRIVED' },
  DRIVER_ARRIVED: { passengerFrom: ['ASSIGNED', 'DRIVER_EN_ROUTE'], passengerTo: 'DRIVER_ARRIVED' },
  STARTED: { tripTo: 'IN_PROGRESS' },
  IN_PROGRESS: { tripTo: 'IN_PROGRESS' },
  COMPLETED: { tripTo: 'COMPLETED' },
};

const updateTripStatus = asyncWrapper(async (req, res) => {
  const { tripId, status } = req.body || {};
  if (!tripId) throw new ValidationError('tripId is required.');

  const transition = DRIVER_APP_TRIP_STATUSES[String(status || '').toUpperCase()];
  if (!transition) {
    throw new ValidationError(
      `Unsupported trip status "${status}". Expected one of: ${Object.keys(DRIVER_APP_TRIP_STATUSES).join(', ')}.`
    );
  }

  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) throw new NotFoundError('Driver profile');

  const trip = await Trip.findOne({ _id: tripId, driverId: driver._id });
  if (!trip) throw new NotFoundError('Trip');

  let event = status;

  if (transition.tripTo === 'IN_PROGRESS') {
    if (trip.status === 'IN_PROGRESS') {
      // Idempotent: the app auto-fires this on load, and a repeat tap must not
      // read as a failure to the driver.
      event = 'ALREADY_STARTED';
    } else if (!['SCHEDULED', 'ACCEPTED'].includes(trip.status)) {
      throw new ValidationError(`Trip cannot be started from ${trip.status}.`);
    } else {
      trip.status = 'IN_PROGRESS';
      trip.startedAt = new Date();
      event = 'STARTED';
    }
  } else if (transition.tripTo === 'COMPLETED') {
    if (trip.status !== 'IN_PROGRESS') {
      throw new ValidationError('Trip can only be completed from IN_PROGRESS status.');
    }
    const boardedNotDropped = (trip.passengers || []).filter((p) => ['RIDE_STARTED', 'DROPPING_OFF'].includes(p.status));
    if (boardedNotDropped.length > 0) {
      throw new ValidationError('All boarded passengers must be dropped off before completing the trip.');
    }
    for (const p of trip.passengers || []) {
      if (!['COMPLETED', 'NO_SHOW'].includes(p.status)) p.status = 'NO_SHOW';
    }
    trip.status = 'COMPLETED';
    trip.completedAt = new Date();
    event = 'COMPLETED';
  } else {
    // Approach notifications: advance only the riders still waiting. Passengers
    // already boarded or dropped are untouched.
    let advanced = 0;
    for (const p of trip.passengers || []) {
      if (transition.passengerFrom.includes(p.status)) {
        p.status = transition.passengerTo;
        advanced += 1;
      }
    }
    if (advanced === 0) event = `${status}_NOOP`;
  }

  await trip.save();
  await emitTripLifecycle(trip, event);

  const updatedQuery = Trip.findById(trip._id);
  RIDER_POPULATE.forEach((spec) => updatedQuery.populate(spec));
  const updated = await updatedQuery.populate('routeId').lean();

  return res.status(200).json(
    formatResponse(`Trip status updated to ${status}.`, toTripView(updated, { viewer: 'driver' }))
  );
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

  const updatedQuery = Trip.findById(trip._id);
  RIDER_POPULATE.forEach((spec) => updatedQuery.populate(spec));
  const updated = await updatedQuery.lean();

  return res.status(200).json(
    formatResponse(`Passenger marked ${transition.to}.`, toTripView(updated, { viewer: 'driver' }))
  );
});

module.exports = {
  getProfile,
  getTrips,
  getEarnings,
  getTripById,
  getTripCustomers,
  startTrip,
  completeTrip,
  updateTripStatus,
  updateManifestStatus,
};
