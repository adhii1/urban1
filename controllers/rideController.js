const RideRequest = require('../models/RideRequest');
const Driver = require('../models/Driver');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { NotFoundError, ValidationError } = require('../utils/AppError');
const { emitToUser, getIO } = require('../config/socket');
const ridePairing = require('../services/ridePairingService');
const logger = require('../utils/logger');

const getMyRides = asyncWrapper(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const filter = { customerId: req.user.id, isDeleted: false };
  if (status) filter.status = status;

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [rides, total] = await Promise.all([
    RideRequest.find(filter)
      .populate('acceptedDriverId', 'name vehicleNumber vehicleModel')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    RideRequest.countDocuments(filter),
  ]);

  return res.status(200).json(
    formatResponse('Rides fetched.', rides, {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    }),
  );
});

const getRideById = asyncWrapper(async (req, res) => {
  const ride = await RideRequest.findOne({
    _id: req.params.id,
    customerId: req.user.id,
    isDeleted: false,
  })
    .populate('acceptedDriverId', 'name vehicleNumber vehicleModel')
    .lean();

  if (!ride) throw new NotFoundError('Ride');

  return res.status(200).json(formatResponse('Ride fetched.', ride));
});

const getActiveRide = asyncWrapper(async (req, res) => {
  const ride = await RideRequest.findOne({
    customerId: req.user.id,
    status: { $in: ['PENDING', 'ACCEPTED', 'DRIVER_ARRIVING', 'IN_PROGRESS'] },
    isDeleted: false,
  })
    .populate('acceptedDriverId', 'name vehicleNumber vehicleModel currentLocation')
    .lean();

  return res.status(200).json(formatResponse('Active ride.', ride || null));
});

const cancelRide = asyncWrapper(async (req, res) => {
  const { reason } = req.body;

  // Atomic cancel: check ownership + status in one operation.
  const ride = await RideRequest.findOneAndUpdate(
    {
      _id: req.params.id,
      customerId: req.user.id,
      isDeleted: false,
      status: { $in: ['PENDING', 'ACCEPTED', 'DRIVER_ARRIVING'] },
    },
    {
      $set: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason || 'Customer cancelled',
        ttlAt: new Date(),
      },
    },
    { new: true }
  );

  if (!ride) {
    // Check if ride exists at all to give a better error message
    const exists = await RideRequest.findOne({ _id: req.params.id, customerId: req.user.id, isDeleted: false })
      .select('status acceptedDriverId customerId matchedDrivers')
      .lean();
    if (!exists) throw new NotFoundError('Ride');
    throw new ValidationError('Cannot cancel ride in current status.');
  }

  // matchedDrivers are cleared by the pre-save hook on CANCELLED, but since
  // we used findOneAndUpdate the hook doesn't fire. Capture from the update.
  // For notifications we need the pre-cancel state — query it separately.
  const preCancelRide = await RideRequest.findOne({ _id: ride._id })
    .select('acceptedDriverId customerId matchedDrivers')
    .lean();
  const preCancelMatchedDrivers = preCancelRide?.matchedDrivers || [];
  const preCancelAcceptedDriverId = preCancelRide?.acceptedDriverId;

  // Notify all matched drivers
  const driverIds = [];
  if (preCancelMatchedDrivers.length) {
    for (const md of preCancelMatchedDrivers) {
      if (md.driverId) driverIds.push(md.driverId);
    }
  }
  if (preCancelAcceptedDriverId && !driverIds.some((id) => id.toString() === preCancelAcceptedDriverId.toString())) {
    driverIds.push(preCancelAcceptedDriverId);
  }
  if (driverIds.length) {
    const drivers = await Driver.find({ _id: { $in: driverIds } }).select('_id userId').lean();
    for (const driver of drivers) {
      emitToUser('driver', driver.userId.toString(), 'ride:unavailable', {
        rideRequestId: ride._id,
        message: preCancelAcceptedDriverId && driver._id.toString() === preCancelAcceptedDriverId.toString()
          ? 'Customer cancelled the ride'
          : 'The ride you were offered has been cancelled',
      });
    }
  }

  if (preCancelAcceptedDriverId) {
    await Driver.findByIdAndUpdate(preCancelAcceptedDriverId, { isAvailable: true });
    ridePairing.clearPairing(preCancelAcceptedDriverId.toString(), ride.customerId.toString());
  }

  try {
    getIO().of('/sockets/admin').emit('ride:update', { rideRequestId: ride._id, status: 'CANCELLED' });
  } catch { /* socket delivery is best-effort */ }
  const { publishCustomerOperation } = require('../services/customerOperationService');
  await publishCustomerOperation({
    type: 'RIDE_CANCELLED',
    customerId: ride.customerId,
    title: 'Customer cancelled a ride',
    summary: `Ride ${ride._id.toString().slice(-6).toUpperCase()} was cancelled.`,
    metadata: { rideId: ride._id.toString(), hadAssignedDriver: Boolean(preCancelAcceptedDriverId) },
  });

  return res.status(200).json(formatResponse('Ride cancelled.', ride));
});

module.exports = {
  getMyRides,
  getRideById,
  getActiveRide,
  cancelRide,
};
