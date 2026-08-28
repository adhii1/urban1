const ShuttleSession = require('../models/ShuttleSession');
const RideRequest = require('../models/RideRequest');
const Driver = require('../models/Driver');
const { haversineKm } = require('../utils/geoHelper');
const { optimizeRoute } = require('./googleMapsService');
const logger = require('../utils/logger');

// ShuttleSession.status enum is: PENDING, DISPATCHED, ACCEPTED, ARRIVING,
// PICKUP_IN_PROGRESS, IN_PROGRESS, COMPLETED, CANCELLED. There is no
// literal 'ACTIVE' value in that enum. "Active" means: a driver has
// accepted the shuttle and it has not yet reached a terminal state.
// PENDING/DISPATCHED are pre-acceptance and intentionally excluded — a
// shuttle a driver hasn't accepted yet is not "their active shuttle".
const ACTIVE_SHUTTLE_STATUSES = ['ACCEPTED', 'ARRIVING', 'PICKUP_IN_PROGRESS', 'IN_PROGRESS'];

async function getShuttleForDriver(driverId) {
  return ShuttleSession.findOne({
    driverId,
    status: { $in: ACTIVE_SHUTTLE_STATUSES },
    isDeleted: false,
  }).lean();
}

async function getActiveShuttleForDriver(driverId) {
  return ShuttleSession.findOne({
    driverId,
    status: { $in: ACTIVE_SHUTTLE_STATUSES },
    isDeleted: false,
  });
}

// Resolves a shuttle session by its own _id, scoped to the requesting driver
// and to an active status. This is the query driverEvents.js's
// shuttle:pickup-verify and shuttle:complete-drop handlers rely on (see the
// comments there) instead of the ambiguous {driverId, status} lookup, which
// could resolve to the wrong ShuttleSession if a driver ever had more than
// one row matching that filter. This function was referenced via
// `shuttleService.getActiveShuttleById(...)` but was never defined/exported
// here, so every call threw `TypeError: shuttleService.getActiveShuttleById
// is not a function`. That exception was caught by the handler's try/catch
// and surfaced to the driver only as a generic "Failed to verify OTP" /
// "Failed to complete drop" error — this was the root cause of OTP
// verification failing for shuttle (bundled) rides.
async function getActiveShuttleById(shuttleSessionId, driverId) {
  return ShuttleSession.findOne({
    _id: shuttleSessionId,
    driverId,
    status: { $in: ACTIVE_SHUTTLE_STATUSES },
    isDeleted: false,
  });
}

async function createShuttleSession(driverId, rideRequestIds, driverLocation) {
  // Keep the legacy call signature used by existing socket handlers while
  // routing all new acceptance through the transactional lifecycle service.
  const lifecycle = require('./shuttleLifecycleService');
  const { shuttleSession } = await lifecycle.acceptBundle({
    driverId,
    rideRequestIds,
    driverLocation,
  });
  return shuttleSession;
}

async function addRideToShuttleSession(shuttleSessionId, rideRequestId, driverLocation) {
  const shuttle = await ShuttleSession.findById(shuttleSessionId);
  if (!shuttle || !ACTIVE_SHUTTLE_STATUSES.includes(shuttle.status)) {
    throw new Error('Shuttle session not found or not active');
  }

  const ride = await RideRequest.findOne({
    _id: rideRequestId,
    status: 'PENDING',
    isDeleted: false,
  });

  if (!ride) {
    throw new Error('Ride request not found or not pending');
  }

  const pickupStop = {
    type: 'PICKUP',
    rideRequestId: ride._id,
    customerId: ride.customerId,
    customerName: ride.customerName,
    location: ride.pickupLocation,
    status: 'PENDING',
    otpVerified: false,
    sequenceOrder: shuttle.sequence.length + 1,
  };

  const dropStop = {
    type: 'DROP',
    rideRequestId: ride._id,
    customerId: ride.customerId,
    customerName: ride.customerName,
    location: ride.dropLocation,
    status: 'PENDING',
    otpVerified: false,
    sequenceOrder: shuttle.sequence.length + 2,
  };

  shuttle.rideRequestIds.push(ride._id);
  shuttle.totalRides = shuttle.rideRequestIds.length;

  const existingCompleted = new Set(
    shuttle.sequence
      .filter((s) => s.status === 'COMPLETED')
      .map((s) => s.rideRequestId.toString())
  );

  const newPickupOrder = shuttle.sequence.length + 1;
  const newDropOrder = shuttle.sequence.length + 2;

  shuttle.sequence.push({
    type: 'PICKUP',
    rideRequestId: ride._id,
    customerId: ride.customerId,
    customerName: ride.customerName,
    location: ride.pickupLocation,
    status: 'PENDING',
    otpVerified: false,
    sequenceOrder: newPickupOrder,
  });

  shuttle.sequence.push({
    type: 'DROP',
    rideRequestId: ride._id,
    customerId: ride.customerId,
    customerName: ride.customerName,
    location: ride.dropLocation,
    status: 'PENDING',
    otpVerified: false,
    sequenceOrder: newDropOrder,
  });

  shuttle.navigationUrl = buildNavigationUrl(shuttle.sequence);

  try {
    await shuttle.save();
  } catch (err) {
    shuttle.rideRequestIds = shuttle.rideRequestIds.filter(
      (id) => id.toString() !== rideRequestId
    );
    shuttle.totalRides = shuttle.rideRequestIds.length;
    shuttle.sequence = shuttle.sequence.filter(
      (s) => s.rideRequestId.toString() !== rideRequestId
    );
    throw err;
  }

  await RideRequest.findByIdAndUpdate(rideRequestId, {
    $set: {
      shuttleSessionId: shuttleSessionId,
      acceptedDriverId: shuttle.driverId,
      status: 'ACCEPTED',
      acceptedAt: new Date(),
    },
  });

  return shuttle;
}

async function removeRideFromShuttleSession(shuttleSessionId, rideRequestId) {
  const shuttle = await ShuttleSession.findById(shuttleSessionId);
  if (!shuttle) {
    throw new Error('Shuttle session not found');
  }

  shuttle.sequence = shuttle.sequence.filter(
    (s) => s.rideRequestId.toString() !== rideRequestId
  );
  shuttle.rideRequestIds = shuttle.rideRequestIds.filter(
    (id) => id.toString() !== rideRequestId
  );
  shuttle.totalRides = shuttle.rideRequestIds.length;

  await shuttle.save();

  await RideRequest.findByIdAndUpdate(rideRequestId, {
    $unset: { shuttleSessionId: 1 },
  });

  return shuttle;
}

async function completeShuttleSession(shuttleSessionId) {
  const shuttle = await ShuttleSession.findById(shuttleSessionId);
  if (!shuttle) {
    throw new Error('Shuttle session not found');
  }

  // The RideRequest lifecycle is authoritative. Sequence entries are a
  // routing projection and must never allow a premature session completion.
  const remainingPassengers = await RideRequest.countDocuments({
    _id: { $in: shuttle.rideRequestIds },
    shuttleSessionId: shuttle._id,
    passengerLifecycle: { $ne: 'DROPPED' },
    isDeleted: false,
  });
  if (remainingPassengers > 0) {
    throw new Error('Cannot complete shuttle: passengers have not all been dropped');
  }

  shuttle.status = 'COMPLETED';
  shuttle.completedAt = new Date();
  await shuttle.save();

  return shuttle;
}

async function cancelShuttleSession(shuttleSessionId) {
  const shuttle = await ShuttleSession.findById(shuttleSessionId);
  if (!shuttle) {
    throw new Error('Shuttle session not found');
  }

  shuttle.status = 'CANCELLED';
  await shuttle.save();

  await RideRequest.updateMany(
    { shuttleSessionId, status: { $in: ['ACCEPTED', 'DRIVER_ARRIVING'] } },
    {
      $unset: { shuttleSessionId: 1 },
      $set: {
        status: 'PENDING',
        acceptedDriverId: null,
        acceptedAt: null,
      },
    }
  );

  return shuttle;
}

async function verifyPickupOtp(shuttleSessionId, rideRequestId, otp) {
  const shuttle = await ShuttleSession.findById(shuttleSessionId);
  if (!shuttle || !ACTIVE_SHUTTLE_STATUSES.includes(shuttle.status)) {
    throw new Error('Shuttle session not found or not active');
  }

  const ride = await RideRequest.findOne({
    _id: rideRequestId,
    shuttleSessionId,
    status: { $in: ['ACCEPTED', 'DRIVER_ARRIVING', 'IN_PROGRESS'] },
  });

  if (!ride) {
    throw new Error('Ride not found in this shuttle');
  }

  if (!ride.otp || !ride.otp.code) {
    throw new Error('OTP not set for this ride');
  }

  if (ride.otp.code !== otp) {
    throw new Error('Invalid OTP');
  }

  if (ride.otp.expiresAt && new Date() > ride.otp.expiresAt) {
    throw new Error('OTP has expired');
  }

  await RideRequest.findByIdAndUpdate(rideRequestId, {
    $set: {
      'otp.verified': true,
      status: 'IN_PROGRESS',
      pickupAt: new Date(),
    },
  });

  const seqEntry = shuttle.sequence.find(
    (s) => s.rideRequestId.toString() === rideRequestId && s.type === 'PICKUP'
  );
  if (seqEntry) {
    seqEntry.status = 'COMPLETED';
    seqEntry.otpVerified = true;
    seqEntry.completedAt = new Date();
  }

  shuttle.completedRides = shuttle.sequence.filter(
    (s) => s.type === 'PICKUP' && s.status === 'COMPLETED'
  ).length;
  await shuttle.save();

  return { success: true, shuttle };
}

async function completeDrop(shuttleSessionId, rideRequestId) {
  const shuttle = await ShuttleSession.findById(shuttleSessionId);
  if (!shuttle || !ACTIVE_SHUTTLE_STATUSES.includes(shuttle.status)) {
    throw new Error('Shuttle session not found or not active');
  }

  const ride = await RideRequest.findById(rideRequestId);
  if (!ride) {
    throw new Error('Ride not found');
  }

  const dropSeqEntry = shuttle.sequence.find(
    (s) => s.rideRequestId.toString() === rideRequestId && s.type === 'DROP'
  );
  if (dropSeqEntry) {
    dropSeqEntry.status = 'COMPLETED';
    dropSeqEntry.completedAt = new Date();
  }

  await RideRequest.findByIdAndUpdate(rideRequestId, {
    $set: {
      status: 'COMPLETED',
      completedAt: new Date(),
      ttlAt: new Date(),
    },
  });

  shuttle.completedRides = shuttle.sequence.filter(
    (s) => s.type === 'DROP' && s.status === 'COMPLETED'
  ).length;

  const allDropsCompleted =
    shuttle.completedRides === shuttle.rideRequestIds.length;
  if (allDropsCompleted) {
    shuttle.status = 'COMPLETED';
    shuttle.completedAt = new Date();
  }

  await shuttle.save();

  return { success: true, shuttle, allDropsCompleted };
}

async function buildSequence(rides, startLocation) {
  const sortedPickups = await optimizePickupOrder(
    rides,
    startLocation || { coordinates: [0, 0] }
  );

  // The start location for drops is the last pickup location
  const lastPickupLocation = sortedPickups[sortedPickups.length - 1].pickupLocation;
  const sortedDrops = await optimizeDropOrder(sortedPickups, lastPickupLocation);

  return buildSequenceFromSortedRides(sortedPickups, sortedDrops);
}

function buildSequenceFromSortedRides(sortedPickups, sortedDrops) {
  const sequence = [];
  let order = 1;

  for (const ride of sortedPickups) {
    sequence.push({
      type: 'PICKUP',
      rideRequestId: ride._id,
      customerId: ride.customerId,
      customerName: ride.customerName,
      location: ride.pickupLocation,
      status: 'PENDING',
      otpVerified: false,
      sequenceOrder: order++,
    });
  }

  for (const ride of sortedDrops) {
    sequence.push({
      type: 'DROP',
      rideRequestId: ride._id,
      customerId: ride.customerId,
      customerName: ride.customerName,
      location: ride.dropLocation,
      status: 'PENDING',
      otpVerified: false,
      sequenceOrder: order++,
    });
  }

  return sequence;
}

async function optimizePickupOrder(rides, startLocation) {
  const startCoords = startLocation.coordinates || [0, 0];

  if (rides.length < 2) {
    return rides;
  }

  try {
    const pickupCoords = rides.map((r) => r.pickupLocation.coordinates);
    const result = await optimizeRoute(startCoords, pickupCoords);

    if (result.source === 'google_maps' && result.optimizedOrder.length === rides.length) {
      return result.optimizedOrder.map((idx) => rides[idx]);
    }
  } catch (err) {
    logger.warn('Google route optimization failed, using nearest-neighbor fallback', { error: err.message });
  }

  return optimizePickupOrderFallback(rides, startCoords);
}

function optimizePickupOrderFallback(rides, startCoords) {
  const pickups = rides.map((r) => ({
    ride: r,
    coords: r.pickupLocation.coordinates,
  }));

  const remaining = [...pickups];
  const sorted = [];
  let current = startCoords;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineKm(current, remaining[i].coords);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    const nearest = remaining.splice(nearestIdx, 1)[0];
    sorted.push(nearest.ride);
    current = nearest.coords;
  }

  return sorted;
}

async function optimizeDropOrder(rides, startLocation) {
  const startCoords = startLocation.coordinates || [0, 0];

  if (rides.length < 2) {
    return rides;
  }

  try {
    const dropCoords = rides.map((r) => r.dropLocation.coordinates);
    const result = await optimizeRoute(startCoords, dropCoords);

    if (result.source === 'google_maps' && result.optimizedOrder.length === rides.length) {
      return result.optimizedOrder.map((idx) => rides[idx]);
    }
  } catch (err) {
    logger.warn('Google route optimization failed, using nearest-neighbor fallback for drops', { error: err.message });
  }

  return optimizeDropOrderFallback(rides, startCoords);
}

function optimizeDropOrderFallback(rides, startCoords) {
  const drops = rides.map((r) => ({
    ride: r,
    coords: r.dropLocation.coordinates,
  }));

  const remaining = [...drops];
  const sorted = [];
  let current = startCoords;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineKm(current, remaining[i].coords);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    const nearest = remaining.splice(nearestIdx, 1)[0];
    sorted.push(nearest.ride);
    current = nearest.coords;
  }

  return sorted;
}

function buildNavigationUrl(sequence) {
  if (!sequence || sequence.length === 0) return null;

  const pendingStops = sequence.filter((s) => s.status === 'PENDING');
  if (pendingStops.length === 0) return null;

  const allStops = [];
  const seenCoordinates = new Set();
  for (const stop of pendingStops) {
    const coordinates = stop.location.coordinates;
    const key = `${coordinates[0]},${coordinates[1]}`;
    if (seenCoordinates.has(key)) continue;
    seenCoordinates.add(key);
    allStops.push(coordinates);
  }

  const dest = allStops[allStops.length - 1];
  const waypoints = allStops.slice(0, -1);

  let url = `https://www.google.com/maps/dir/?api=1&origin=Current+Location&destination=${dest[1]},${dest[0]}&travelmode=driving`;

  if (waypoints.length > 0) {
    const wpStr = waypoints.map((wp) => `${wp[1]},${wp[0]}`).join('|');
    url += `&waypoints=${wpStr}`;
  }

  return url;
}

function buildShuttleNavUrlFromSession(shuttle) {
  if (!shuttle || !shuttle.sequence) return null;
  return buildNavigationUrl(shuttle.sequence);
}

async function getShuttleWithRideDetails(shuttleSessionId) {
  const shuttle = await ShuttleSession.findById(shuttleSessionId).lean();
  if (!shuttle) return null;

  const rides = await RideRequest.find({
    _id: { $in: shuttle.rideRequestIds },
  }).lean();

  return { shuttle, rides };
}

module.exports = {
  ACTIVE_SHUTTLE_STATUSES,
  createShuttleSession,
  addRideToShuttleSession,
  removeRideFromShuttleSession,
  completeShuttleSession,
  cancelShuttleSession,
  verifyPickupOtp,
  completeDrop,
  getShuttleForDriver,
  getActiveShuttleForDriver,
  getActiveShuttleById,
  buildSequence,
  buildNavigationUrl,
  buildShuttleNavUrlFromSession,
  getShuttleWithRideDetails,
  optimizePickupOrder,
};