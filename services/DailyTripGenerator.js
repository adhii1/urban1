/**
 * DailyTripGenerator — Per PDF section 18
 *
 * Don't create a completely new booking every day.
 * The subscription stores the schedule, and the backend generates/activates
 * individual daily trips. This gives a proper historical record.
 *
 * Flow:
 * 1. Find all ACTIVE subscriptions eligible for tomorrow's service date
 * 2. Group them by assignedDriverId
 * 3. For each driver, create/update a Trip with all assigned passengers
 * 4. Optimize pickup order by geographic proximity (PDF section 12)
 * 5. Generate OTPs for each passenger (PDF section 15)
 * 6. Generate Google Maps navigation URL (PDF section 11)
 */

const Subscription = require('../models/Subscription');
const Trip = require('../models/Trip');
const Driver = require('../models/Driver');
const { haversineKm } = require('../utils/geoHelper');
const logger = require('../utils/logger');

/**
 * Generate a 4-digit OTP for a passenger ride.
 */
function generateRideOtp() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Build Google Maps navigation URL with ordered stops (PDF section 11).
 * Opens Google Maps with the driver's stops in order.
 */
function buildNavigationUrl(driverCoords, passengers, dropCoords) {
  // Google Maps directions URL format:
  // https://www.google.com/maps/dir/origin/waypoint1/waypoint2/.../destination
  const origin = `${driverCoords[1]},${driverCoords[0]}`; // lat,lng

  // Waypoints are passenger pickups in order
  const waypoints = passengers
    .sort((a, b) => (a.pickupOrder || 0) - (b.pickupOrder || 0))
    .map((p) => `${p.pickupLocation.coordinates[1]},${p.pickupLocation.coordinates[0]}`)
    .join('/');

  // Destination is the common drop area (use first passenger's drop)
  const destination = dropCoords
    ? `${dropCoords[1]},${dropCoords[0]}`
    : waypoints.split('/').pop();

  return `https://www.google.com/maps/dir/${origin}/${waypoints}/${destination}`;
}

/**
 * Optimize pickup sequence by geographic proximity from driver location.
 * Per PDF section 12: route order should NOT be customer booking order.
 * Uses nearest-neighbor heuristic starting from driver's location.
 */
function optimizePickupOrder(driverCoords, passengers) {
  if (!passengers.length) return passengers;
  if (!driverCoords || driverCoords[0] === 0) return passengers;

  const unvisited = [...passengers];
  const ordered = [];
  let currentCoords = driverCoords;

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const pCoords = unvisited[i].pickupLocation?.coordinates;
      if (!pCoords) continue;
      const dist = haversineKm(currentCoords, pCoords);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    const nearest = unvisited.splice(nearestIdx, 1)[0];
    nearest.pickupOrder = ordered.length + 1;
    ordered.push(nearest);
    currentCoords = nearest.pickupLocation?.coordinates || currentCoords;
  }

  return ordered;
}

/**
 * Check if a given date's day-of-week matches the subscription's scheduleDays.
 */
function isEligibleDay(scheduleDays, date) {
  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  return scheduleDays.includes(dayOfWeek);
}

/**
 * Main generator: create trips for a specific service date.
 * Called by the daily cron job (e.g. every night for next day).
 */
async function generateTripsForDate(serviceDate) {
  const normalized = new Date(serviceDate);
  normalized.setHours(0, 0, 0, 0);
  const dayOfWeek = normalized.getDay();

  logger.info('[DailyTripGenerator] Starting generation', { serviceDate: normalized, dayOfWeek });

  // Find all ACTIVE subscriptions whose scheduleDays include this day
  const subscriptions = await Subscription.find({
    status: 'ACTIVE',
    isDeleted: false,
    scheduleDays: dayOfWeek,
    startDate: { $lte: normalized },
    endDate: { $gte: normalized },
    assignedDriverId: { $ne: null },
  })
    .populate('customerId')
    .populate('assignedDriverId')
    .lean();

  if (!subscriptions.length) {
    logger.info('[DailyTripGenerator] No eligible subscriptions for this date');
    return { serviceDate: normalized, createdTrips: 0, passengers: 0 };
  }

  // Group by assigned driver
  const driverGroups = new Map();
  for (const sub of subscriptions) {
    const driverId = sub.assignedDriverId?._id?.toString();
    if (!driverId) continue;
    if (!driverGroups.has(driverId)) {
      driverGroups.set(driverId, { driver: sub.assignedDriverId, subscriptions: [] });
    }
    driverGroups.get(driverId).subscriptions.push(sub);
  }

  let createdTrips = 0;
  let totalPassengers = 0;

  for (const [driverId, group] of driverGroups) {
    const { driver, subscriptions: driverSubs } = group;

    // Check if trip already exists for this driver on this date
    let trip = await Trip.findOne({ driverId: driver._id, serviceDate: normalized });
    if (trip) {
      // Trip already generated (idempotent)
      continue;
    }

    // Build passenger list with OTPs
    const passengers = driverSubs.map((sub) => ({
      customerId: sub.customerId?._id || sub.customerId,
      subscriptionId: sub._id,
      pickupLocation: sub.pickupLocation,
      dropLocation: sub.dropLocation,
      otp: { code: generateRideOtp(), verified: false },
      status: 'ASSIGNED',
    }));

    // Enforce capacity (PDF section 4: backend must never exceed capacity)
    const capacity = driver.vehicleCapacity || 4;
    const validPassengers = passengers.slice(0, capacity);

    // Optimize pickup order by geographic proximity (PDF section 12)
    const driverCoords = driver.currentLocation?.coordinates || [0, 0];
    const orderedPassengers = optimizePickupOrder(driverCoords, validPassengers);

    // Build navigation URL (PDF section 11)
    const firstDrop = orderedPassengers[0]?.dropLocation?.coordinates;
    const navigationUrl = buildNavigationUrl(driverCoords, orderedPassengers, firstDrop);

    // Create the trip
    try {
      trip = await Trip.create({
        driverId: driver._id,
        areaId: driver.areaId,
        serviceDate: normalized,
        pickupTime: driverSubs[0]?.pickupTime || '08:00',
        status: 'SCHEDULED',
        assignmentStatus: 'PENDING',
        passengers: orderedPassengers,
        navigationUrl,
      });
      createdTrips++;
      totalPassengers += orderedPassengers.length;

      logger.info('[DailyTripGenerator] Trip created', {
        tripId: trip._id,
        driverId: driver._id,
        driverName: driver.name,
        passengerCount: orderedPassengers.length,
        serviceDate: normalized,
      });
    } catch (error) {
      if (error.code === 11000) {
        // Duplicate — trip already exists (race condition), skip
        logger.info('[DailyTripGenerator] Trip already exists (concurrent)', { driverId, serviceDate: normalized });
      } else {
        logger.error('[DailyTripGenerator] Failed to create trip', { driverId, error: error.message });
      }
    }
  }

  logger.info('[DailyTripGenerator] Generation complete', {
    serviceDate: normalized,
    createdTrips,
    totalPassengers,
    driverGroups: driverGroups.size,
  });

  return { serviceDate: normalized, createdTrips, passengers: totalPassengers };
}

/**
 * Generate trips for tomorrow (called by cron nightly).
 */
async function generateTripsForTomorrow() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return generateTripsForDate(tomorrow);
}

module.exports = {
  generateTripsForDate,
  generateTripsForTomorrow,
  generateRideOtp,
  optimizePickupOrder,
  buildNavigationUrl,
  isEligibleDay,
};
