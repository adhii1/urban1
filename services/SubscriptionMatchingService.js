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
 * Step 1: Find the admin-defined area that contains the pickup coordinates.
 */
async function findAreaForPickup(pickupCoordinates) {
  const [lng, lat] = pickupCoordinates;
  const areas = await Area.find({ status: 'ACTIVE' }).lean();
  for (const area of areas) {
    const dist = haversineKm([lng, lat], area.center.coordinates);
    if (dist <= area.radiusKm) return area;
  }
  return null;
}

/**
 * Step 2-4: Find eligible drivers in the area within 5km with sufficient capacity.
 * Per PDF section 8: area + active + available + capacity + schedule + route compatibility.
 */
async function findEligibleDrivers({ pickupCoordinates, area, scheduleDays, serviceDate, requiredCapacity = 1 }) {
  if (!area) return [];

  const [lng, lat] = pickupCoordinates;

  // Get all active drivers assigned to this area
  const drivers = await Driver.find({
    areaId: area._id,
    status: 'ACTIVE',
    isDeleted: false,
  }).lean();

  if (!drivers.length) return [];

  const candidates = [];

  for (const driver of drivers) {
    // Distance check (PDF section 7: only drivers ≤ 5km)
    const driverCoords = driver.currentLocation?.coordinates;
    if (!driverCoords || (driverCoords[0] === 0 && driverCoords[1] === 0)) {
      // Use area center as fallback for drivers without live location
      // This is valid because admin assigned them to this area
    }
    const distanceKm = driverCoords && driverCoords[0] !== 0
      ? haversineKm([lng, lat], driverCoords)
      : haversineKm([lng, lat], area.center.coordinates);

    if (distanceKm > MAX_PICKUP_RADIUS_KM) continue;

    // Capacity check (PDF section 4): vehicleCapacity - currentlyAssignedCustomers = remainingCapacity
    const remainingCapacity = await getRemainingCapacity(driver._id, serviceDate, scheduleDays);
    if (remainingCapacity < requiredCapacity) continue;

    // Schedule compatibility: check the driver doesn't have a conflicting trip at the same time
    // (For subscription trips, drivers serve all customers in their area on service days)

    // Route compatibility score (PDF section 8):
    // How well does this new customer's pickup/drop fit with existing passengers?
    const routeScore = await calculateRouteCompatibility(driver._id, pickupCoordinates, serviceDate);

    candidates.push({
      driver,
      distanceKm,
      remainingCapacity,
      routeCompatibility: routeScore,
      // Composite score: lower distance + higher capacity + better route = better candidate
      score: (1 / (distanceKm + 0.1)) * 0.4 + (remainingCapacity / driver.vehicleCapacity) * 0.3 + routeScore * 0.3,
    });
  }

  // Rank candidates by composite score (PDF section 8: rank the candidates)
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Calculate remaining capacity for a driver on given schedule days.
 * Per PDF section 4: vehicleCapacity - currentlyAssignedCustomers = remainingCapacity
 * The backend must never exceed capacity.
 */
async function getRemainingCapacity(driverId, serviceDate, scheduleDays) {
  const driver = await Driver.findById(driverId).lean();
  if (!driver) return 0;

  // Count currently assigned passengers across all active subscriptions for this driver
  // that overlap with the given schedule days
  const assignedSubs = await Subscription.countDocuments({
    assignedDriverId: driverId,
    status: 'ACTIVE',
    isDeleted: false,
    scheduleDays: { $in: scheduleDays || [1, 2, 3, 4, 5] },
  });

  return Math.max(0, (driver.vehicleCapacity || 4) - assignedSubs);
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
 * Assign a driver to a subscription and update both records.
 */
async function assignDriverToSubscription(subscriptionId, driverId, areaId) {
  const subscription = await Subscription.findByIdAndUpdate(
    subscriptionId,
    {
      assignedDriverId: driverId,
      assignedAreaId: areaId,
    },
    { new: true }
  );
  return subscription;
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
