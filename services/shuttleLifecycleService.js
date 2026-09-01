const mongoose = require('mongoose');
const RideRequest = require('../models/RideRequest');
const ShuttleSession = require('../models/ShuttleSession');
const { generateOtp } = require('../utils/otpHelper');
const { AppError } = require('../utils/AppError');
const { haversineKm } = require('../utils/geoHelper');

const ACTIVE_SESSION_STATUSES = ['ACCEPTED', 'ARRIVING', 'PICKUP_IN_PROGRESS', 'IN_PROGRESS'];
const OTP_TTL_MS = 30 * 60 * 1000;
const MAX_BUNDLE_DISTANCE_KM = 5;

class ShuttleLifecycleError extends AppError {
  constructor(code, message, statusCode = 400) {
    super(message, statusCode, { code });
    this.code = code;
  }
}

function idString(value) {
  return value?.toString();
}

function assertDistinctRideIds(rideRequestIds) {
  if (!Array.isArray(rideRequestIds) || rideRequestIds.length === 0) {
    throw new ShuttleLifecycleError('EMPTY_BUNDLE', 'At least one ride request is required');
  }
  const ids = rideRequestIds.map(idString);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new ShuttleLifecycleError('INVALID_BUNDLE', 'Ride request identifiers must be distinct');
  }
  return ids;
}

function assertCompatibleRides(rides) {
  for (let firstIndex = 0; firstIndex < rides.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < rides.length; secondIndex += 1) {
      const first = rides[firstIndex];
      const second = rides[secondIndex];
      const pickupDistance = haversineKm(first.pickupLocation.coordinates, second.pickupLocation.coordinates);
      const dropDistance = haversineKm(first.dropLocation.coordinates, second.dropLocation.coordinates);
      if (pickupDistance > MAX_BUNDLE_DISTANCE_KM || dropDistance > MAX_BUNDLE_DISTANCE_KM) {
        throw new ShuttleLifecycleError(
          'INCOMPATIBLE_RIDES',
          `All shuttle pickups and destinations must be within ${MAX_BUNDLE_DISTANCE_KM} km of one another`
        );
      }
    }
  }
}

function passengerProjection(ride, shuttleSessionId) {
  const lifecycle = ride.passengerLifecycle || 'PENDING';
  return {
    shuttleSessionId: idString(shuttleSessionId || ride.shuttleSessionId),
    rideRequestId: idString(ride._id),
    customerId: idString(ride.customerId),
    passengerName: ride.customerName || 'Passenger',
    pickup: ride.pickupLocation,
    drop: ride.dropLocation,
    lifecycle,
    boardedAt: ride.pickupAt || null,
    droppedAt: ride.completedAt || null,
    permittedAction: lifecycle === 'PENDING' ? 'VERIFY_PICKUP_OTP' : lifecycle === 'BOARDED' ? 'COMPLETE_DROP' : null,
  };
}

async function runTransaction(work) {
  const dbSession = await mongoose.startSession();
  try {
    let result;
    await dbSession.withTransaction(async () => { result = await work(dbSession); });
    return result;
  } finally {
    await dbSession.endSession();
  }
}

async function acceptBundle({ driverId, rideRequestIds, driverLocation }) {
  const requestedIds = assertDistinctRideIds(rideRequestIds);
  const rides = await RideRequest.find({
    _id: { $in: rideRequestIds }, status: 'PENDING', isDeleted: false,
    shuttleSessionId: { $exists: false },
  }).lean();
  if (rides.length !== requestedIds.length) {
    throw new ShuttleLifecycleError('RIDES_UNAVAILABLE', 'One or more rides are no longer available', 409);
  }
  assertCompatibleRides(rides);

  // Resolve lazily to avoid a module cycle: shuttleService delegates bundle
  // creation here while retaining route-sequencing helpers for compatibility.
  const { buildSequence, buildNavigationUrl } = require('./shuttleService');
  const sequence = await buildSequence(rides, driverLocation || { coordinates: [0, 0] });
  const navigationUrl = buildNavigationUrl(sequence);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const otpByRideId = new Map();
  const usedOtps = new Set();
  for (const ride of rides) {
    let code;
    do { code = generateOtp(); } while (usedOtps.has(code));
    usedOtps.add(code);
    otpByRideId.set(idString(ride._id), code);
  }

  return runTransaction(async (dbSession) => {
    const [shuttle] = await ShuttleSession.create([{
      driverId, rideRequestIds: rides.map((ride) => ride._id), status: 'ACCEPTED',
      sequence, navigationUrl, totalRides: rides.length, completedRides: 0,
    }], { session: dbSession });

    const writes = rides.map((ride) => ({
      updateOne: {
        filter: { _id: ride._id, status: 'PENDING', isDeleted: false, shuttleSessionId: { $exists: false } },
        update: { $set: {
          shuttleSessionId: shuttle._id, acceptedDriverId: driverId, status: 'ACCEPTED',
          acceptedAt: new Date(), passengerLifecycle: 'PENDING',
          otp: { code: otpByRideId.get(idString(ride._id)), expiresAt, verified: false },
        } },
      },
    }));
    const updateResult = await RideRequest.bulkWrite(writes, { session: dbSession });
    if (updateResult.modifiedCount !== rides.length) {
      throw new ShuttleLifecycleError('RIDES_UNAVAILABLE', 'One or more rides were accepted by another driver', 409);
    }
    const acceptedRides = await RideRequest.find({ _id: { $in: rides.map((ride) => ride._id) } })
      .session(dbSession).lean();
    return {
      shuttleSession: shuttle.toObject(),
      passengers: acceptedRides.map((ride) => passengerProjection(ride, shuttle._id)),
      acceptedRides,
    };
  });
}

async function requireOwnedSession({ driverId, shuttleSessionId, rideRequestId, dbSession }) {
  const shuttle = await ShuttleSession.findOne({
    _id: shuttleSessionId, driverId, status: { $in: ACTIVE_SESSION_STATUSES },
    rideRequestIds: rideRequestId, isDeleted: false,
  }).session(dbSession);
  if (!shuttle) {
    throw new ShuttleLifecycleError('SHUTTLE_NOT_AUTHORIZED', 'Shuttle session is not assigned to this driver', 403);
  }
  return shuttle;
}

async function verifyPassengerPickup({ driverId, shuttleSessionId, rideRequestId, otp }) {
  if (!otp) throw new ShuttleLifecycleError('OTP_REQUIRED', 'Passenger OTP is required');
  const now = new Date();
  return runTransaction(async (dbSession) => {
    const shuttle = await requireOwnedSession({ driverId, shuttleSessionId, rideRequestId, dbSession });
    const ride = await RideRequest.findOneAndUpdate({
      _id: rideRequestId, shuttleSessionId, acceptedDriverId: driverId,
      passengerLifecycle: 'PENDING', status: { $in: ['ACCEPTED', 'DRIVER_ARRIVING'] },
      'otp.code': otp, $or: [{ 'otp.expiresAt': { $gt: now } }, { 'otp.expiresAt': null }],
    }, { $set: { passengerLifecycle: 'BOARDED', status: 'IN_PROGRESS', pickupAt: now, 'otp.verified': true } },
      { new: true, session: dbSession }).lean();
    if (!ride) throw new ShuttleLifecycleError('PICKUP_NOT_PERMITTED', 'OTP, ride state, or driver authorization is invalid', 403);

    const sequenceResult = await ShuttleSession.updateOne({ _id: shuttle._id, driverId }, {
      $set: { 'sequence.$[pickup].status': 'COMPLETED', 'sequence.$[pickup].otpVerified': true,
        'sequence.$[pickup].passengerLifecycle': 'BOARDED', 'sequence.$[pickup].completedAt': now,
        status: 'PICKUP_IN_PROGRESS' },
    }, { arrayFilters: [{ 'pickup.rideRequestId': ride._id, 'pickup.type': 'PICKUP', 'pickup.status': 'PENDING' }], session: dbSession });
    if (sequenceResult.modifiedCount !== 1) throw new ShuttleLifecycleError('PICKUP_NOT_PERMITTED', 'Pickup is not pending');
    const updatedSession = await ShuttleSession.findById(shuttle._id).session(dbSession).lean();
    return { shuttleSession: updatedSession, passenger: passengerProjection(ride, shuttle._id) };
  });
}

async function completePassengerDrop({ driverId, shuttleSessionId, rideRequestId }) {
  const now = new Date();
  return runTransaction(async (dbSession) => {
    const shuttle = await requireOwnedSession({ driverId, shuttleSessionId, rideRequestId, dbSession });
    const ride = await RideRequest.findOneAndUpdate({
      _id: rideRequestId, shuttleSessionId, acceptedDriverId: driverId,
      passengerLifecycle: 'BOARDED', status: 'IN_PROGRESS',
    }, { $set: { passengerLifecycle: 'DROPPED', status: 'COMPLETED', completedAt: now, ttlAt: now } },
      { new: true, session: dbSession }).lean();
    if (!ride) throw new ShuttleLifecycleError('DROP_NOT_PERMITTED', 'Ride is not boarded or is not assigned to this driver', 403);

    const sequenceResult = await ShuttleSession.updateOne({ _id: shuttle._id, driverId }, {
      $set: { 'sequence.$[drop].status': 'COMPLETED', 'sequence.$[drop].passengerLifecycle': 'DROPPED',
        'sequence.$[drop].completedAt': now },
      $inc: { completedRides: 1 },
    }, { arrayFilters: [{ 'drop.rideRequestId': ride._id, 'drop.type': 'DROP', 'drop.status': 'PENDING' }], session: dbSession });
    if (sequenceResult.modifiedCount !== 1) throw new ShuttleLifecycleError('DROP_NOT_PERMITTED', 'Drop is not pending');

    const remainingPassengers = await RideRequest.countDocuments({
      shuttleSessionId, passengerLifecycle: { $ne: 'DROPPED' }, isDeleted: false,
    }).session(dbSession);
    const allDropped = remainingPassengers === 0;
    if (allDropped) {
      await ShuttleSession.updateOne({ _id: shuttle._id, driverId, status: { $in: ACTIVE_SESSION_STATUSES } },
        { $set: { status: 'COMPLETED', completedAt: now } }, { session: dbSession });
    }
    const updatedSession = await ShuttleSession.findById(shuttle._id).session(dbSession).lean();
    return { shuttleSession: updatedSession, passenger: passengerProjection(ride, shuttle._id), allDropped };
  });
}

async function getDriverPassengerProjection({ driverId, shuttleSessionId }) {
  const shuttle = await ShuttleSession.findOne({ _id: shuttleSessionId, driverId, isDeleted: false }).lean();
  if (!shuttle) throw new ShuttleLifecycleError('SHUTTLE_NOT_AUTHORIZED', 'Shuttle session is not assigned to this driver', 403);
  const rides = await RideRequest.find({ _id: { $in: shuttle.rideRequestIds }, shuttleSessionId, isDeleted: false }).lean();
  return rides.map((ride) => passengerProjection(ride, shuttle._id));
}

module.exports = {
  ACTIVE_SESSION_STATUSES,
  ShuttleLifecycleError,
  acceptBundle,
  verifyPassengerPickup,
  completePassengerDrop,
  getDriverPassengerProjection,
  passengerProjection,
};
