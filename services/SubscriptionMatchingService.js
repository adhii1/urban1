/**
 * SubscriptionMatchingService — Per PDF sections 7-9
 *
 * Unified matching engine for HYBRID and WEEKDAYS subscriptions.
 * Flow: Area → 5km radius → Capacity → Schedule compatibility → Route compatibility → Rank
 *
 * The customer does NOT choose the driver.
 * The driver does NOT choose which customers to take.
 * The backend calculates the appropriate driver based on Admin configuration + location + capacity + route.
 */

const Area = require('../models/Area');
const Driver = require('../models/Driver');
const Subscription = require('../models/Subscription');
const Trip = require('../models/Trip');
const { haversineKm } = require('../utils/geoHelper');
const logger = require('../utils/logger');

const MAX_PICKUP_RADIUS_KM = 5;

/**
 * Step 1: Find the admin-defined area whose radius contains the pickup point.
 * Uses the Area `center` 2dsphere index via $geoNear (ordered by distance),
 * keeping only areas whose radiusKm actually covers the pickup.
 */
async function findAreaForPickup(pickupCoordinates) {
  const [lng, lat] = pickupCoordinates;
  const [area] = await Area.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceM',
        spherical: true,
        query: { status: 'ACTIVE', isDeleted: false },
      },
    },
    // Keep only areas whose service radius covers the pickup (metres vs km*1000).
    { $match: { $expr: { $lte: ['$distanceM', { $multiply: ['$radiusKm', 1000] }] } } },
    { $limit: 1 },
  ]);
  // $geoNear returns the raw doc including zoneId, which matching reads directly.
  return area || null;
}

/**
 * Step 2-4: Find eligible drivers in the area within 5km with sufficient
 * capacity, then rank them. Capacity and route-compatibility are computed with
 * two batched queries over all candidate drivers (no per-driver round trips).
 */
async function findEligibleDrivers({ pickupCoordinates, area, scheduleDays, requiredCapacity = 1 }) {
  const [lng, lat] = pickupCoordinates || [77.6501, 12.9141];
  const days = scheduleDays && scheduleDays.length ? scheduleDays : [1, 2, 3, 4, 5];

  // Zone-aware driver resolution (scalable):
  //   pickup → area → area.zoneId → all drivers in that zone
  // Fallbacks preserve older data: drivers pinned to the area, then any active driver.
  let drivers = [];
  const zoneId = area?.zoneId?._id || area?.zoneId || null;

  // 1. Preferred: drivers belonging to the area's zone (a zone spans many areas).
  if (zoneId) {
    drivers = await Driver.find({
      zoneId,
      status: 'ACTIVE',
      isDeleted: false,
    }).lean();
  }

  // 2. Fallback: drivers pinned to the specific area (legacy area-only assignment).
  if (!drivers.length && area && area._id) {
    drivers = await Driver.find({
      areaId: area._id,
      status: 'ACTIVE',
      isDeleted: false,
    }).lean();
  }

  // 3. Final fallback: any active driver system-wide.
  if (!drivers.length) {
    drivers = await Driver.find({
      status: 'ACTIVE',
      isDeleted: false,
    }).lean();
  }

  if (!drivers.length) return [];

  const driverIds = drivers.map((d) => d._id);

  // Batched capacity: count ACTIVE subs per driver overlapping these schedule
  // days — one aggregation instead of one query per driver.
  const capacityAgg = await Subscription.aggregate([
    {
      $match: {
        assignedDriverId: { $in: driverIds },
        status: 'ACTIVE',
        isDeleted: false,
        scheduleDays: { $in: days },
      },
    },
    { $group: { _id: '$assignedDriverId', count: { $sum: 1 } } },
  ]);
  const assignedCount = new Map(capacityAgg.map((r) => [r._id.toString(), r.count]));

  // Batched route-compatibility inputs: every existing passenger pickup per
  // driver — one query instead of one per driver.
  const existingSubs = await Subscription.find({
    assignedDriverId: { $in: driverIds },
    status: 'ACTIVE',
    isDeleted: false,
  })
    .select('assignedDriverId pickupLocation')
    .lean();
  const pickupsByDriver = new Map();
  for (const sub of existingSubs) {
    const key = sub.assignedDriverId.toString();
    const coords = sub.pickupLocation?.coordinates;
    if (!coords) continue;
    if (!pickupsByDriver.has(key)) pickupsByDriver.set(key, []);
    pickupsByDriver.get(key).push(coords);
  }

  const candidates = [];
  for (const driver of drivers) {
    const driverCoords = driver.currentLocation?.coordinates;
    // Drivers without a live location are proxied by the area center
    const refCoords = (area && area.center && area.center.coordinates) ? area.center.coordinates : [lng, lat];
    const distanceKm = driverCoords && driverCoords[0] !== 0
      ? haversineKm([lng, lat], driverCoords)
      : haversineKm([lng, lat], refCoords);

    if (distanceKm > MAX_PICKUP_RADIUS_KM) continue;

    const used = assignedCount.get(driver._id.toString()) || 0;
    const remainingCapacity = Math.max(0, (driver.vehicleCapacity || 4) - used);

    if (remainingCapacity < requiredCapacity) continue;

    const pickups = pickupsByDriver.get(driver._id.toString()) || [];
    const routeCompatibility = pickups.length === 0
      ? 1.0
      : Math.max(0, 1 - (pickups.reduce((t, c) => t + haversineKm(pickupCoordinates, c), 0) / pickups.length) / MAX_PICKUP_RADIUS_KM);

    candidates.push({
      driver,
      distanceKm: Math.round(distanceKm * 10) / 10,
      remainingCapacity,
      routeCompatibility,
      score:
        (1 / (distanceKm + 0.1)) * 0.4 +
        (remainingCapacity / (driver.vehicleCapacity || 4)) * 0.3 +
        routeCompatibility * 0.3,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Remaining schedule-aware capacity for a single driver. Kept for callers that
 * need a one-off figure; the ranking path uses the batched version above.
 */
async function getRemainingCapacity(driver, serviceDate, scheduleDays) {
  const driverDoc = driver && driver.vehicleCapacity != null
    ? driver
    : await Driver.findById(driver?._id || driver).lean();
  if (!driverDoc) return 0;

  const assignedSubs = await Subscription.countDocuments({
    assignedDriverId: driverDoc._id,
    status: 'ACTIVE',
    isDeleted: false,
    scheduleDays: { $in: scheduleDays || [1, 2, 3, 4, 5] },
  });
  return Math.max(0, (driverDoc.vehicleCapacity || 4) - assignedSubs);
}

/**
 * Calculate route compatibility: how well does a new pickup fit with existing passengers?
 * Returns 0-1 score. Higher = better fit (closer to existing passenger pickups).
 */
async function calculateRouteCompatibility(driverId, pickupCoordinates, serviceDate) {
  const existingSubs = await Subscription.find({
    assignedDriverId: driverId,
    status: 'ACTIVE',
    isDeleted: false,
  }).select('pickupLocation').lean();

  if (!existingSubs.length) return 1.0; // No existing passengers = perfect compatibility

  // Average distance from new pickup to all existing pickups
  let totalDist = 0;
  for (const sub of existingSubs) {
    const coords = sub.pickupLocation?.coordinates;
    if (coords) totalDist += haversineKm(pickupCoordinates, coords);
  }
  const avgDist = totalDist / existingSubs.length;

  // Score: closer average = better (max 5km radius, so normalize by that)
  return Math.max(0, 1 - avgDist / MAX_PICKUP_RADIUS_KM);
}

/**
 * Main entry point: Match a subscription to the best available driver.
 * Per PDF section 24 flow:
 * Customer books → Subscription → Matching Engine → Area + 5km + Capacity → Route Compat → Driver Candidates
 */
async function matchSubscription(subscription) {
  const pickupCoords = subscription.pickupLocation?.coordinates || [77.6501, 12.9141];

  // Step 1: Find area (or fallback area)
  let area = null;
  if (pickupCoords && pickupCoords.length >= 2) {
    area = await findAreaForPickup(pickupCoords);
  }
  if (!area) {
    area = await Area.findOne({ status: 'ACTIVE', isDeleted: false }).lean()
      || await Area.findOne({ isDeleted: false }).lean();
  }

  // Steps 2-4: Find eligible drivers
  let candidates = await findEligibleDrivers({
    pickupCoordinates: pickupCoords,
    area,
    scheduleDays: subscription.scheduleDays,
    serviceDate: new Date(),
    requiredCapacity: 1,
  });

  if (!candidates.length) {
    return { success: false, reason: 'No registered drivers found in the system' };
  }

  // Return the best candidate
  const best = candidates[0];

  return {
    success: true,
    driver: best.driver,
    area: area || { _id: best.driver.areaId, name: 'Service Area' },
    distanceKm: best.distanceKm,
    remainingCapacity: best.remainingCapacity,
    routeCompatibility: best.routeCompatibility,
    allCandidates: candidates,
  };
}

/**
 * Assign a driver to a subscription, atomically reserving one seat of capacity.
 *
 * The reservation is a guarded $inc that only succeeds while the driver's
 * activeSubscriptionCount is below vehicleCapacity — this is what prevents two
 * concurrent bookings from over-filling a driver. Reassignment releases the
 * previous driver's seat. Pass { force:true } for admin overrides.
 *
 * Returns { success, subscription?, reason? }.
 */
async function assignDriverToSubscription(subscriptionId, driverId, areaId, { force = false } = {}) {
  const subscription = await Subscription.findById(subscriptionId);
  if (!subscription) return { success: false, reason: 'Subscription not found' };

  const previousDriverId = subscription.assignedDriverId?.toString();
  if (previousDriverId === driverId.toString()) {
    // Same driver (e.g. location change kept them) — no capacity change.
    if (areaId) {
      subscription.assignedAreaId = areaId;
      await subscription.save();
    }
    return { success: true, subscription, reassigned: false };
  }

  // Atomically reserve a seat on the new driver.
  let filter = { _id: driverId };
  if (!force) {
    filter.$expr = { $lt: [{ $ifNull: ['$activeSubscriptionCount', 0] }, '$vehicleCapacity'] };
  }
  let reserved = await Driver.findOneAndUpdate(
    filter,
    { $inc: { activeSubscriptionCount: 1 } },
    { new: true }
  );

  if (!reserved) return { success: false, reason: 'Driver not found' };

  // Release the previous driver's seat, if reassigning.
  if (previousDriverId) {
    await Driver.updateOne(
      { _id: previousDriverId, activeSubscriptionCount: { $gt: 0 } },
      { $inc: { activeSubscriptionCount: -1 } }
    );
  }

  subscription.assignedDriverId = driverId;
  if (areaId) subscription.assignedAreaId = areaId;
  await subscription.save();
  return { success: true, subscription, reassigned: Boolean(previousDriverId) };
}

/**
 * Re-match a subscription when customer changes location (PDF section 19).
 * Check if current driver is still valid; if not, find new driver.
 */
async function rematchOnLocationChange(subscription) {
  const pickupCoords = subscription.pickupLocation?.coordinates;
  const currentDriverId = subscription.assignedDriverId;

  if (!currentDriverId) {
    // No current driver, just do a fresh match
    return matchSubscription(subscription);
  }

  // Check if current driver is still within 5km and has capacity
  const area = await findAreaForPickup(pickupCoords);
  if (!area) {
    return { success: false, reason: 'New location is not within any service area', requiresReassignment: true };
  }

  const currentDriver = await Driver.findById(currentDriverId).lean();
  if (!currentDriver || currentDriver.areaId?.toString() !== area._id.toString()) {
    // Driver not in the new area — reassignment required
    return matchSubscription(subscription);
  }

  const driverCoords = currentDriver.currentLocation?.coordinates || area.center.coordinates;
  const distance = haversineKm(pickupCoords, driverCoords);
  if (distance > MAX_PICKUP_RADIUS_KM) {
    // Driver too far from new location
    return matchSubscription(subscription);
  }

  // Current driver still valid — keep them but recalculate route
  return {
    success: true,
    driver: currentDriver,
    area,
    distanceKm: distance,
    keptExistingDriver: true,
  };
}

/**
 * Full rebundling orchestration when a customer changes their pickup/drop
 * location beyond 5 km (PDF section 19).
 *
 * Steps:
 *  1. Re-match to find the best driver for the new coordinates.
 *  2. If the driver changed, remove the customer's passenger entry from all
 *     future SCHEDULED trips on the OLD driver.
 *  3. Add the customer to the NEW driver's upcoming trips (via DailyTripGenerator).
 *  4. Emit socket events so both the old and new driver see the bundle change
 *     in real-time on their dashboard/current-trip screen.
 *
 * Returns a rich result object consumed by bookingController.updateLocation.
 */
async function rebundleOnLocationChange(subscription) {
  const previousDriverId = subscription.assignedDriverId?.toString();
  const pickupCoords = subscription.pickupLocation?.coordinates;

  // Step 1: run rematching
  const matchResult = await rematchOnLocationChange(subscription);

  if (!matchResult.success) {
    logger.warn('[SubscriptionMatchingService] rebundle: no valid driver for new location', {
      subscriptionId: subscription._id,
      reason: matchResult.reason,
    });
    // Create an OperationalException so ops can resolve this manually.
    try {
      const OperationalException = require('../models/OperationalException');
      await OperationalException.create({
        type: 'ROUTE_CHANGE_CONFLICT',
        subscriptionId: subscription._id,
        serviceDate: new Date(),
        reason: matchResult.reason || 'Location change resulted in no eligible driver',
        status: 'OPEN',
      });
    } catch (exErr) {
      logger.warn('[SubscriptionMatchingService] Could not create OperationalException for rebundle failure', { error: exErr.message });
    }
    return { success: false, reason: matchResult.reason };
  }

  const newDriver = matchResult.driver;
  const newDriverId = newDriver._id.toString();
  const driverChanged = previousDriverId && previousDriverId !== newDriverId;

  // Step 2: Assign the new driver to the subscription (atomic capacity swap)
  await assignDriverToSubscription(subscription._id, newDriver._id, matchResult.area?._id);

  // Step 3 (only needed if driver actually changed): reconcile future trips
  let removedFromTrips = 0;
  let addedToTrips = 0;
  if (driverChanged) {
    const Trip = require('../models/Trip');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Remove passenger from old driver's future scheduled trips
    const oldTrips = await Trip.find({
      driverId: previousDriverId,
      'passengers.subscriptionId': subscription._id,
      serviceDate: { $gte: today },
      status: 'SCHEDULED',
      isDeleted: false,
    });

    for (const trip of oldTrips) {
      trip.passengers = (trip.passengers || []).filter(
        (p) => !p.subscriptionId || p.subscriptionId.toString() !== subscription._id.toString()
      );
      if (trip.passengers.length === 0) {
        trip.status = 'CANCELLED';
        trip.cancelReason = 'All passengers rebundled to a different driver';
      } else {
        // Re-optimize the remaining passengers' pickup order
        const { optimizePickupOrder, buildNavigationUrl } = require('./DailyTripGenerator');
        const driverDoc = await Driver.findById(previousDriverId).lean();
        const driverCoords = driverDoc?.currentLocation?.coordinates || [0, 0];
        trip.passengers = optimizePickupOrder(driverCoords, trip.passengers);
        trip.navigationUrl = buildNavigationUrl(driverCoords, trip.passengers, trip.passengers[0]?.dropLocation?.coordinates);
      }
      await trip.save();
      removedFromTrips++;
    }

    // Add passenger to new driver's upcoming trips
    const { regenerateForSubscription } = require('./DailyTripGenerator');
    const genResult = await regenerateForSubscription(subscription._id, { days: 14 }).catch((err) => {
      logger.error('[SubscriptionMatchingService] rebundle trip regen failed', { error: err.message });
      return { created: 0, merged: 0 };
    });
    addedToTrips = genResult.created + genResult.merged;
  }

  // Step 4: emit real-time socket events to both drivers
  try {
    const { emitToUser } = require('../config/socket');

    // Notify old driver their bundle changed
    if (driverChanged) {
      const oldDriverDoc = await Driver.findById(previousDriverId)
        .populate('userId', '_id')
        .lean();
      if (oldDriverDoc?.userId?._id) {
        const updatedOldTrip = await (require('../models/Trip')).findOne({
          driverId: previousDriverId,
          serviceDate: { $gte: (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })() },
          status: 'SCHEDULED',
          isDeleted: false,
        }).populate({ path: 'passengers.customerId', select: 'name' }).lean();

        emitToUser('driver', oldDriverDoc.userId._id.toString(), 'trip:bundle:updated', {
          type: 'PASSENGER_REMOVED',
          subscriptionId: subscription._id.toString(),
          reason: 'Customer changed pickup location (>5 km from your service area)',
          trip: updatedOldTrip ? {
            tripId: updatedOldTrip._id,
            passengerCount: (updatedOldTrip.passengers || []).length,
            passengers: (updatedOldTrip.passengers || []).map((p) => ({
              name: p.customerId?.name || 'Passenger',
              pickup: p.pickupLocation?.address,
              drop: p.dropLocation?.address,
              status: p.status,
            })),
          } : null,
        });
      }
    }

    // Notify new driver they have a new passenger (or updated bundle)
    const newDriverDoc = await Driver.findById(newDriverId)
      .populate('userId', '_id')
      .lean();
    if (newDriverDoc?.userId?._id) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const updatedNewTrip = await (require('../models/Trip')).findOne({
        driverId: newDriverId,
        serviceDate: { $gte: today },
        status: 'SCHEDULED',
        isDeleted: false,
      }).populate({ path: 'passengers.customerId', select: 'name' }).lean();

      emitToUser('driver', newDriverDoc.userId._id.toString(), 'trip:bundle:updated', {
        type: driverChanged ? 'PASSENGER_ADDED' : 'PASSENGER_LOCATION_UPDATED',
        subscriptionId: subscription._id.toString(),
        reason: driverChanged
          ? 'A customer rebundled to your route from a nearby area'
          : 'A passenger updated their pickup location',
        newPickupAddress: subscription.pickupLocation?.address || 'Updated',
        trip: updatedNewTrip ? {
          tripId: updatedNewTrip._id,
          passengerCount: (updatedNewTrip.passengers || []).length,
          passengers: (updatedNewTrip.passengers || []).map((p) => ({
            name: p.customerId?.name || 'Passenger',
            pickup: p.pickupLocation?.address,
            drop: p.dropLocation?.address,
            status: p.status,
          })),
        } : null,
      });
    }
  } catch (socketErr) {
    // Socket errors must never abort a location update — they're best-effort.
    logger.warn('[SubscriptionMatchingService] Socket emit failed during rebundle', { error: socketErr.message });
  }

  logger.info('[SubscriptionMatchingService] rebundle complete', {
    subscriptionId: subscription._id,
    driverChanged,
    previousDriverId,
    newDriverId,
    removedFromTrips,
    addedToTrips,
  });

  return {
    success: true,
    driver: newDriver,
    area: matchResult.area,
    distanceKm: matchResult.distanceKm,
    driverChanged,
    previousDriverId,
    removedFromTrips,
    addedToTrips,
    keptExistingDriver: matchResult.keptExistingDriver || false,
  };
}

module.exports = {
  findAreaForPickup,
  findEligibleDrivers,
  getRemainingCapacity,
  calculateRouteCompatibility,
  matchSubscription,
  assignDriverToSubscription,
  rematchOnLocationChange,
  rebundleOnLocationChange,
  MAX_PICKUP_RADIUS_KM,
};
