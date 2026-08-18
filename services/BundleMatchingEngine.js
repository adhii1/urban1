const RideRequest = require('../models/RideRequest');
const mongoose = require('mongoose');
const spatialCluster = require('./SpatialClusterService');
const scoringService = require('./BundleScoringService');
const assignmentService = require('./DriverAssignmentService');
const { emitToUser } = require('../config/socket');
const logger = require('../utils/logger');
const { estimateEtaMinutes } = require('../utils/geoHelper');
const { MATCH_RADIUS_KM } = require('./matchingService');

// Time to wait before giving up on bundling and dispatching as a single ride
const BUNDLE_WAIT_TIME_MS = 10 * 1000;
let recoveryInterval = null;

/**
 * Event-driven trigger when a new ride request is created.
 */
async function processNewRideRequest(rideRequestId) {
  try {
    const primaryRide = await RideRequest.findById(rideRequestId).lean();
    if (!primaryRide) {
      logger.info('[BUNDLE_DEBUG] Ride skipped', { RideRequestId: rideRequestId, Reason: 'Ride not found' });
      return;
    }

    logger.info('[BUNDLE_DEBUG] Processing ride', {
      RideRequestId: rideRequestId,
      Status: primaryRide.status,
      isBundled: primaryRide.isBundled
    });

    if (primaryRide.status !== 'PENDING') {
      logger.info('[BUNDLE_DEBUG] Ride skipped', { Reason: 'Invalid status' });
      return;
    }
    if (primaryRide.isBundled) {
      logger.info('[BUNDLE_DEBUG] Ride skipped', { Reason: 'Already bundled' });
      return;
    }

    // 1. Find compatible rides
    const compatibleRides = await spatialCluster.findCompatibleRides(primaryRide);

    if (compatibleRides.length > 0) {
      logger.info('[BUNDLE_DEBUG] Compatible rides found', {
        PrimaryRide: rideRequestId,
        CompatibleRideCount: compatibleRides.length,
        CompatibleRideIds: compatibleRides.map(r => r._id)
      });
      // 2. Generate bundles
      const possibleBundles = spatialCluster.generateBundles(primaryRide, compatibleRides);

      if (possibleBundles.length > 0) {
        logger.info('[BUNDLE_DEBUG] Candidate bundles generated', {
          BundleCount: possibleBundles.length,
          BundleSizes: possibleBundles.map(b => b.length)
        });
        // 3. Score bundles and pick the best
        const best = scoringService.getBestBundle(possibleBundles);
        if (best && best.bundle) {
          logger.info('[BUNDLE_DEBUG] Best bundle selected', {
            BundleSize: best.bundle.length,
            BundleRideIds: best.bundle.map(r => r._id),
            Score: best.score
          });
          await dispatchBundle(best.bundle);
          return;
        }
      }
    } else {
      logger.info('[BUNDLE_DEBUG] No compatible rides found');
    }

    // If no bundle formed, it stays PENDING. 
    // The recovery job will dispatch it as a single ride if it waits too long.
  } catch (err) {
    logger.error('Error processing new ride request for bundling', { error: err.message });
  }
}

/**
 * Locks the rides, assigns a bundle ID, finds a driver, and dispatches.
 */
async function dispatchBundle(bundleRides) {
  const rideIds = bundleRides.map(r => r._id);
  const bundleId = new mongoose.Types.ObjectId().toString();

  logger.info('[BUNDLE_DEBUG] Dispatch started', {
    BundleId: bundleId,
    RideIds: rideIds,
    BundleSize: bundleRides.length
  });

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Lock the rides
    const updateRes = await RideRequest.updateMany(
      { _id: { $in: rideIds }, status: 'PENDING', isBundled: { $ne: true } },
      { $set: { isBundled: true, bundleId: bundleId } },
      { session }
    );

    if (updateRes.modifiedCount !== rideIds.length) {
      // One of the rides was already taken, abort and rollback
      logger.info('[BUNDLE_DEBUG] Bundle lock failed', { Reason: 'One or more rides already taken' });
      await session.abortTransaction();
      session.endSession();
      return;
    }

    logger.info('[BUNDLE_DEBUG] Bundle locked', { BundleId: bundleId });

    // Find drivers
    const drivers = await assignmentService.findDriversForBundle(bundleRides);

    if (drivers.length === 0) {
      // No drivers found, rollback the lock and let them be processed again later
      await session.abortTransaction();
      session.endSession();
      return;
    }

    // Add matched drivers to all rides in the bundle
    const matchedDriverData = drivers.map(d => ({
      driverId: d._id,
      distanceKm: d.distanceKm,
      notifiedAt: new Date()
    }));

    await RideRequest.updateMany(
      { _id: { $in: rideIds } },
      { $push: { matchedDrivers: { $each: matchedDriverData } } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    // Re-fetch the updated rides to get their full data for sending
    const lockedRides = await RideRequest.find({ bundleId }).lean();
    if (lockedRides.length === 0) return;

    // Pick a primary ride for the frontend (the original one)
    // We sort them so the oldest request acts as the primary
    lockedRides.sort((a, b) => a.requestedAt - b.requestedAt);
    const primary = lockedRides[0];
    const others = lockedRides.slice(1);

    // LEGACY REPRESENTATION (kept only for backward compatibility with any
    // existing driver-app parsing of `stops`). This encodes other
    // passengers' pickup/drop as fake "stops" with string-prefixed
    // addresses, which is exactly the "additional rides representation"
    // that makes the driver UI inconsistent — it has no rideRequestId,
    // customer identity, or per-passenger OTP/status, so the driver app
    // can't render a real passenger list from it.
    const combinedStops = [...(primary.stops || [])];
    for (const other of others) {
      combinedStops.push({
        address: `[Pickup] ${other.pickupLocation.address}`,
        type: 'Point',
        coordinates: other.pickupLocation.coordinates
      });
      combinedStops.push({
        address: `[Drop] ${other.dropLocation.address}`,
        type: 'Point',
        coordinates: other.dropLocation.coordinates
      });
    }

    // CORRECT representation: a structured passenger list, one entry per
    // ride in the bundle, each carrying its own rideRequestId so the driver
    // app can show "N passengers" with each passenger's own pickup/drop —
    // and so that after acceptance, actions (OTP verify, drop) can target
    // the right rideRequestId instead of only ever knowing the primary ride.
    // NOTE FOR FRONTEND: the driver app should switch to reading
    // `passengers` for bundle offers instead of parsing `stops` strings.
    const passengers = lockedRides.map((r) => ({
      rideRequestId: r._id,
      customerName: r.customerName,
      pickup: { address: r.pickupLocation.address, coordinates: r.pickupLocation.coordinates },
      drop: { address: r.dropLocation.address, coordinates: r.dropLocation.coordinates },
      fareEstimate: r.fare?.estimated,
      isPrimary: r._id.toString() === primary._id.toString(),
    }));

    // Send to drivers
    const emittedDriverIds = [];
    const deliveredDriverIds = [];
    const undeliveredDrivers = [];
    const skippedDrivers = [];
    for (const driver of drivers) {
      const driverUserId = driver.userId?._id?.toString?.() || driver.userId?.toString?.();
      if (!driverUserId) {
        // driver.userId failed to populate (e.g. dangling ref) — this driver
        // was found but cannot be notified. Record it so the found/emitted
        // counts can be reconciled instead of silently diverging.
        skippedDrivers.push({ DriverId: driver._id, Reason: 'userId not populated' });
        continue;
      }

      const driverCoords = driver.currentLocation?.coordinates || [0, 0];
      const etaMinutes = estimateEtaMinutes(driverCoords, primary.pickupLocation.coordinates);

      // NOTE: DriverId here is the Driver collection _id — the same id
      // DriverAssignmentService's "[BUNDLE_DEBUG] Drivers found" log uses.
      // DriverUserId is a *different* id (Driver.userId, a ref to User) —
      // socket connections are keyed by User._id (see config/socket.js:
      // socket.userId = user._id), so emitToUser is intentionally called
      // with driverUserId, not driver._id. Logging DriverUserId under the
      // key "DriverId" (as before) made it look like an unrelated set of
      // drivers was being notified, when it was really the same drivers
      // referenced by their User-account id instead of their Driver-profile
      // id.
      logger.info('[BUNDLE_DEBUG] Sending bundle to driver', {
        DriverId: driver._id,
        DriverUserId: driverUserId,
        BundleId: bundleId,
        PrimaryRideId: primary._id,
        BundleSize: bundleRides.length,
        StopCount: combinedStops.length,
        isBundleOffer: true
      });

      // BUG (fixed): emitToUser's return value — whether a connected socket
      // was actually found and the event actually written to it — was
      // previously discarded. The code below unconditionally logged
      // "Bundle emitted successfully" and counted the driver as emitted,
      // even when activeSockets had no live socket for this userId (e.g.
      // driver momentarily disconnected/reconnecting). That is exactly how
      // "backend logs success but the driver frontend never receives the
      // event" happens with zero trace of *why*. Now we check the actual
      // delivered boolean and log accordingly.
      const delivered = emitToUser('driver', driverUserId, 'ride:new-request', {
        rideRequestId: primary._id, // Primary ride ID — used for the ride:accept call
        pickup: { address: primary.pickupLocation.address, coordinates: primary.pickupLocation.coordinates },
        drop: { address: primary.dropLocation.address, coordinates: primary.dropLocation.coordinates },
        stops: combinedStops, // DEPRECATED legacy shape — see `passengers` below
        passengers, // Structured passenger list — one entry per rider in the bundle
        passengerCount: passengers.length,
        distanceKm: driver.distanceKm,
        etaMinutes,
        expiresAt: primary.expiresAt,
        fareEstimate: primary.fare?.estimated,
        tripDistance: primary.fare?.details?.distanceKm,
        isBundleOffer: true // Backend marker if needed, frontend ignores unknown fields
      });

      emittedDriverIds.push(driver._id.toString());

      // Persist a Notification record so the driver's Notifications page
      // shows this offer even if they weren't connected at emit time.
      try {
        const Notification = require('../models/Notification');
        Notification.create({
          userId: driverUserId,
          title: passengers.length > 1 ? `New Shared Ride (${passengers.length} passengers)` : 'New Ride Request',
          body: `Pickup: ${primary.pickupLocation.address} → Drop: ${primary.dropLocation.address} | Fare: ₹${primary.fare?.estimated || 0}`,
          type: 'RIDE',
          metadata: { rideRequestId: primary._id.toString(), bundleId },
        }).catch(() => {});
      } catch (_) { /* non-critical */ }

      if (delivered) {
        deliveredDriverIds.push(driver._id.toString());
        logger.info('[BUNDLE_DEBUG] Bundle emitted successfully', { DriverId: driver._id, DriverUserId: driverUserId });
      } else {
        undeliveredDrivers.push({ DriverId: driver._id.toString(), DriverUserId: driverUserId, Reason: 'No connected socket found in activeSockets for this userId at emit time' });
        logger.warn('[BUNDLE_DEBUG] Bundle emit call made but NOT delivered - no connected socket', { DriverId: driver._id, DriverUserId: driverUserId });
      }
    }

    // Execution trace: the Driver._id set found by the search must equal
    // the Driver._id set actually emitted to (skipped entries explain any
    // shortfall; there should never be an emitted id absent from Found).
    // DriversEmittedIds = emitToUser was called (does NOT prove delivery).
    // DriversDeliveredIds = emitToUser confirmed a connected socket received
    // the event. A driver can be "emitted" without being "delivered" —
    // that gap is exactly the "logs success but frontend receives nothing"
    // symptom, and is now visible via UndeliveredDrivers below instead of
    // being silently swallowed.
    console.log('[EXECUTION_TRACE] dispatchBundle driver notification', {
      BundleId: bundleId,
      DriversFoundIds: drivers.map(d => d._id.toString()),
      DriversEmittedIds: emittedDriverIds,
      DriversDeliveredIds: deliveredDriverIds,
      UndeliveredDrivers: undeliveredDrivers,
      SkippedDrivers: skippedDrivers,
      Match: JSON.stringify(drivers.map(d => d._id.toString()).sort()) === JSON.stringify(emittedDriverIds.slice().sort()),
      AllDelivered: undeliveredDrivers.length === 0 && emittedDriverIds.length > 0
    });


  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    logger.error('Error dispatching bundle', { error: err.message });
  }
}

/**
 * Periodically checks for PENDING rides that haven't been bundled.
 * If they've waited past BUNDLE_WAIT_TIME_MS, dispatches them as single rides.
 */
async function runRecoveryJob() {
  try {
    const cutoffTime = new Date(Date.now() - BUNDLE_WAIT_TIME_MS);

    // Fetch raw rides created in the last 10 minutes to explain exclusions (bypassing Mongoose default isDeleted: false filters)
    const mongoose = require('mongoose');
    const rawRides = await mongoose.model('RideRequest').collection.find({
      createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
    }).toArray();

    console.log('[RECOVERY_JOB_AUDIT] Raw rides in last 10 minutes count:', rawRides.length);
    for (const ride of rawRides) {
      const isPending = ride.status === 'PENDING';
      const isNotBundled = ride.isBundled === false;
      const isNotDeleted = ride.isDeleted === false;
      const isStale = new Date(ride.requestedAt) < cutoffTime;

      const included = isPending && isNotBundled && isNotDeleted && isStale;
      if (!included) {
        const reasons = [];
        if (!isPending) reasons.push(`status is '${ride.status}' (expected 'PENDING')`);
        if (!isNotBundled) reasons.push(`isBundled is ${ride.isBundled} (expected false)`);
        if (!isNotDeleted) reasons.push(`isDeleted is ${ride.isDeleted} (expected false)`);
        if (!isStale) {
          const waitTime = Date.now() - new Date(ride.requestedAt).getTime();
          reasons.push(`waiting time is ${waitTime}ms (expected > ${BUNDLE_WAIT_TIME_MS}ms)`);
        }
        console.log(`[RECOVERY_EXCLUSION_TRACE] RideRequest ${ride._id} excluded from recovery: ${reasons.join(', ')}`);
      } else {
        console.log(`[RECOVERY_INCLUSION_TRACE] RideRequest ${ride._id} matched stale query criteria`);
      }
    }

    // Find rides that have waited long enough and aren't bundled
    const staleRides = await RideRequest.find({
      status: 'PENDING',
      isBundled: false,
      dispatchPolicy: { $ne: 'RAJU_KUMAR_ONLY' },
      requestedAt: { $lt: cutoffTime },
      isDeleted: false
    }).lean();

    logger.info('[BUNDLE_DEBUG] Recovery cycle started', { PendingRideCount: staleRides.length });

    for (const ride of staleRides) {
      console.log('[RECOVERY_RETURNED_RIDE_TRACE] Stale RideRequest returned by Recovery Job query:', {
        rideRequestId: ride._id,
        status: ride.status,
        isBundled: ride.isBundled,
        isDeleted: ride.isDeleted,
        requestedAt: ride.requestedAt
      });
      const waitSeconds = Math.floor((Date.now() - new Date(ride.requestedAt).getTime()) / 1000);
      logger.info('[BUNDLE_DEBUG] Single ride fallback', {
        RideId: ride._id,
        WaitingTimeSeconds: waitSeconds
      });
      // Just dispatch it as a bundle of 1 (which acts like a single ride)
      await dispatchBundle([ride]);
    }
  } catch (err) {
    logger.error('Error in bundle recovery job', { error: err.message });
  }
}

function startRecoveryJob() {
  if (!recoveryInterval) {
    recoveryInterval = setInterval(runRecoveryJob, 5000);
  }
}

function stopRecoveryJob() {
  if (recoveryInterval) {
    clearInterval(recoveryInterval);
    recoveryInterval = null;
  }
}

module.exports = {
  processNewRideRequest,
  dispatchBundle,
  startRecoveryJob,
  stopRecoveryJob
};