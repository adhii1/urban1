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
  return area || null;
}

/**
 * Step 2-4: Find eligible drivers in the area within 5km with sufficient
 * capacity, then rank them. Capacity and route-compatibility are computed with
 * two batched queries over all candidate drivers (no per-driver round trips).
 */
async function findEligibleDrivers({ pickupCoordinates, area, scheduleDays, requiredCapacity = 1 }) {
  if (!area) return [];

  const [lng, lat] = pickupCoordinates;
  const days = scheduleDays && scheduleDays.length ? scheduleDays : [1, 2, 3, 4, 5];

  // All active drivers assigned to this area.
  const drivers = await Driver.find({
    areaId: area._id,
    status: 'ACTIVE',
    isDeleted: false,
  }).lean();
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
    // Drivers without a live location are proxied by the area center (admin
    // assigned them to this area).
    const distanceKm = driverCoords && driverCoords[0] !== 0
      ? haversineKm([lng, lat], driverCoords)
      : haversineKm([lng, lat], area.center.coordinates);
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
      distanceKm,
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
  const pickupCoords = subscription.pickupLocation?.coordinates;
  if (!pickupCoords || pickupCoords.length < 2) {
    return { success: false, reason: 'Invalid pickup coordinates' };
  }

  // Step 1: Find area
  const area = await findAreaForPickup(pickupCoords);
  if (!area) {
    return { success: false, reason: 'No service area covers this pickup location' };
  }

  // Steps 2-4: Find eligible drivers
  const candidates = await findEligibleDrivers({
    pickupCoordinates: pickupCoords,
    area,
    scheduleDays: subscription.scheduleDays,
    serviceDate: new Date(),
    requiredCapacity: 1,
  });

  if (!candidates.length) {
    return { success: false, reason: 'No eligible drivers available in this area', area };
  }

  // Return the best candidate (PDF: backend chooses the top-ranked driver)
  const best = candidates[0];

  return {
    success: true,
    driver: best.driver,
    area,
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
  const filter = { _id: driverId };
  if (!force) {
    filter.$expr = { $lt: [{ $ifNull: ['$activeSubscriptionCount', 0] }, '$vehicleCapacity'] };
  }
  const reserved = await Driver.findOneAndUpdate(
    filter,
    { $inc: { activeSubscriptionCount: 1 } },
    { new: true }
  );
  if (!reserved) return { success: false, reason: 'Driver is at capacity' };

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

module.exports = {
  findAreaForPickup,
  findEligibleDrivers,
  getRemainingCapacity,
  calculateRouteCompatibility,
  matchSubscription,
  assignDriverToSubscription,
  rematchOnLocationChange,
  MAX_PICKUP_RADIUS_KM,
};
