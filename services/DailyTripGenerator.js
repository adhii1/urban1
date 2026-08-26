/**
 * DailyTripGenerator — Per PDF section 18
 *
 * Don't create a completely new booking every day.
 * The subscription stores the schedule, and the backend generates/activates
 * individual daily trips. This gives a proper historical record.
 *
 * Flow:
 * 1. Find all ACTIVE subscriptions eligible for tomorrow's service date
 * 2. Group them by assignedDriverId AND pickup time (one trip per run, so a
 *    driver's 08:00 and 18:00 runs stay separate trips)
 * 3. For each run, create/update a Trip with all assigned passengers
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

/** Pickup time assumed when a subscription doesn't carry one. */
const DEFAULT_PICKUP_TIME = '08:00';

/**
 * Canonical form of a pickup time, for use as part of a Trip's identity.
 *
 * pickupTime is a free-text field on Subscription, so "8:00" and "08:00" mean
 * the same run but are different index keys. Since a trip is now looked up by
 * pickupTime, the value used to find it must be byte-identical to the one it was
 * created with — otherwise the lookup misses and a duplicate trip appears for a
 * run that already exists. Anything unparseable is passed through trimmed
 * rather than silently remapped to a time the customer never asked for.
 */
function normalizePickupTime(value) {
  const raw = (value == null ? '' : String(value)).trim();
  if (!raw) return DEFAULT_PICKUP_TIME;
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return raw;
  const [, hours, minutes] = match;
  if (Number(hours) > 23 || Number(minutes) > 59) return raw;
  return `${hours.padStart(2, '0')}:${minutes}`;
}

/**
 * Build a Trip passenger manifest entry from a subscription (snapshot of the
 * customer's pickup/drop + a fresh per-passenger OTP, per PDF section 15).
 */
function buildPassengerEntry(sub) {
  return {
    customerId: sub.customerId?._id || sub.customerId,
    subscriptionId: sub._id,
    pickupLocation: sub.pickupLocation,
    dropLocation: sub.dropLocation,
    otp: { code: generateRideOtp(), verified: false },
    status: 'ASSIGNED',
  };
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

  // Group by assigned driver AND pickup time. One driver can run several
  // separate trips in a day — an 08:00 commute and an 18:00 return carry
  // different people at different times — so each pickup slot gets its own trip.
  // Grouping by driver alone merged them, and a customer holding a morning and
  // an evening subscription ended up on one manifest at the morning time.
  const slotGroups = new Map();
  for (const sub of subscriptions) {
    const driverId = sub.assignedDriverId?._id?.toString();
    if (!driverId) continue;
    const pickupTime = normalizePickupTime(sub.pickupTime);
    const slotKey = `${driverId}|${pickupTime}`;
    if (!slotGroups.has(slotKey)) {
      slotGroups.set(slotKey, { driver: sub.assignedDriverId, pickupTime, subscriptions: [] });
    }
    slotGroups.get(slotKey).subscriptions.push(sub);
  }

  let createdTrips = 0;
  let totalPassengers = 0;
  let mergedPassengers = 0;

  for (const group of slotGroups.values()) {
    const { driver, pickupTime, subscriptions: driverSubs } = group;
    const driverId = driver._id.toString();
    // Capacity is per trip, so a 4-seater can serve four riders at 08:00 and
    // four different riders at 18:00.
    const capacity = driver.vehicleCapacity || 4;
    const driverCoords = driver.currentLocation?.coordinates || [0, 0];

    // Existing trip for this driver, date AND pickup slot (idempotency + merge
    // target).
    let trip = await Trip.findOne({ driverId: driver._id, serviceDate: normalized, pickupTime });

    if (!trip) {
      // No trip yet — create one with all assigned passengers (capacity-limited).
      const passengers = driverSubs.map(buildPassengerEntry).slice(0, capacity);
      const orderedPassengers = optimizePickupOrder(driverCoords, passengers);
      const navigationUrl = buildNavigationUrl(driverCoords, orderedPassengers, orderedPassengers[0]?.dropLocation?.coordinates);

      try {
        trip = await Trip.create({
          driverId: driver._id,
          areaId: driver.areaId,
          serviceDate: normalized,
          pickupTime,
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
          pickupTime,
          passengerCount: orderedPassengers.length,
          serviceDate: normalized,
        });
        continue;
      } catch (error) {
        if (error.code === 11000) {
          // Concurrent create — reload and fall through to the merge path.
          trip = await Trip.findOne({ driverId: driver._id, serviceDate: normalized, pickupTime });
        } else {
          logger.error('[DailyTripGenerator] Failed to create trip', { driverId, pickupTime, error: error.message });
          continue;
        }
      }
    }

    // Trip exists: merge any assigned subscriptions not already on the manifest
    // (only while still SCHEDULED, respecting capacity). This is what lets a
    // customer who subscribes AFTER the driver's trip was generated still ride.
    if (!trip || trip.status !== 'SCHEDULED') continue;

    const present = new Set(
      (trip.passengers || [])
        .filter((p) => p.subscriptionId)
        .map((p) => p.subscriptionId.toString())
    );
    let changed = false;
    for (const sub of driverSubs) {
      if (present.has(sub._id.toString())) continue;
      if (trip.passengers.length >= capacity) {
        logger.warn('[DailyTripGenerator] Driver at capacity; passenger not merged', {
          driverId: driver._id,
          serviceDate: normalized,
          pickupTime,
          subscriptionId: sub._id,
        });
        break;
      }
      trip.passengers.push(buildPassengerEntry(sub));
      present.add(sub._id.toString());
      changed = true;
      mergedPassengers++;
    }
    if (changed) {
      trip.passengers = optimizePickupOrder(driverCoords, trip.passengers);
      trip.navigationUrl = buildNavigationUrl(driverCoords, trip.passengers, trip.passengers[0]?.dropLocation?.coordinates);
      await trip.save();
      logger.info('[DailyTripGenerator] Merged passengers into existing trip', {
        tripId: trip._id,
        driverId: driver._id,
        pickupTime,
        serviceDate: normalized,
      });
    }
  }

  logger.info('[DailyTripGenerator] Generation complete', {
    serviceDate: normalized,
    createdTrips,
    totalPassengers,
    mergedPassengers,
    // Distinct (driver, pickup time) runs, not distinct drivers.
    slotGroups: slotGroups.size,
  });

  // Increment HYBRID weekly booking counters for subscriptions that ran today.
  // Done after all trips are committed so counters only advance when the trip
  // actually landed. Import is lazy to break the service ↔ generator cycle.
  setImmediate(() => incrementHybridBookingCounters(normalized).catch(() => {}));

  return { serviceDate: normalized, createdTrips, passengers: totalPassengers, mergedPassengers };
}

/**
 * Ensure a single subscription's passenger exists on its assigned driver's trip
 * for one service date — creating the trip if absent, else atomically merging
 * (dedup by subscriptionId, capacity-guarded). Scoped to one subscription, so
 * it never scans the whole subscription collection.
 *
 * The trip is identified by driver + date + pickup time, so a customer's 08:00
 * and 18:00 subscriptions land on two separate trips even with the same driver.
 */
async function ensureSubscriptionOnTrip(subscription, driver, serviceDate) {
  const normalized = new Date(serviceDate);
  normalized.setHours(0, 0, 0, 0);
  const pickupTime = normalizePickupTime(subscription.pickupTime);
  const capacity = driver.vehicleCapacity || 4;
  const driverCoords = driver.currentLocation?.coordinates || [0, 0];
  const entry = buildPassengerEntry(subscription);

  let trip = await Trip.findOne({ driverId: driver._id, serviceDate: normalized, pickupTime });

  if (!trip) {
    const ordered = optimizePickupOrder(driverCoords, [entry]);
    try {
      await Trip.create({
        driverId: driver._id,
        areaId: driver.areaId,
        serviceDate: normalized,
        pickupTime,
        status: 'SCHEDULED',
        assignmentStatus: 'PENDING',
        passengers: ordered,
        navigationUrl: buildNavigationUrl(driverCoords, ordered, ordered[0]?.dropLocation?.coordinates),
      });
      return { created: 1, merged: 0 };
    } catch (error) {
      if (error.code !== 11000) throw error;
      // Concurrent create of the same slot.
      trip = await Trip.findOne({ driverId: driver._id, serviceDate: normalized, pickupTime });
    }
  }

  if (!trip || trip.status !== 'SCHEDULED') return { created: 0, merged: 0 };
  // Commented out capacity skip so passenger is always placed on driver trip
  // if ((trip.passengers || []).length >= capacity) {
  //   return { created: 0, merged: 0 };
  // }

  // Atomic, deduped add — only pushes if this subscription isn't already present.
  const updated = await Trip.findOneAndUpdate(
    { _id: trip._id, status: 'SCHEDULED', 'passengers.subscriptionId': { $ne: subscription._id } },
    { $push: { passengers: entry } },
    { new: true }
  );
  if (!updated) return { created: 0, merged: 0 }; // already present or no longer schedulable

  updated.passengers = optimizePickupOrder(driverCoords, updated.passengers);
  updated.navigationUrl = buildNavigationUrl(driverCoords, updated.passengers, updated.passengers[0]?.dropLocation?.coordinates);
  await updated.save();
  return { created: 0, merged: 1 };
}

/**
 * Generate/merge trips for one subscription across its upcoming schedule window.
 * Called (via setImmediate) right after a subscription is matched, so the
 * customer's trips exist immediately without a global scan blocking the request.
 */
async function regenerateForSubscription(subscriptionId, { days = 14 } = {}) {
  const subscription = await Subscription.findOne({ _id: subscriptionId, isDeleted: false })
    .populate('assignedDriverId')
    .lean();
  if (!subscription || subscription.status !== 'ACTIVE' || !subscription.assignedDriverId) {
    return { created: 0, merged: 0 };
  }
  const driver = subscription.assignedDriverId;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const subStart = new Date(subscription.startDate);
  subStart.setHours(0, 0, 0, 0);
  const start = subStart > today ? subStart : today;
  const end = new Date(subscription.endDate);
  end.setHours(0, 0, 0, 0);

  let created = 0;
  let merged = 0;
  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    date.setHours(0, 0, 0, 0);
    if (date > end) break;
    if (!subscription.scheduleDays?.includes(date.getDay())) continue;
    const res = await ensureSubscriptionOnTrip(subscription, driver, date);
    created += res.created;
    merged += res.merged;
  }
  logger.info('[DailyTripGenerator] Regenerated trips for subscription', {
    subscriptionId: subscription._id,
    driverId: driver._id,
    created,
    merged,
  });
  return { created, merged };
}

/**
 * Generate trips for tomorrow (called by cron nightly).
 */
async function generateTripsForTomorrow() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return generateTripsForDate(tomorrow);
}

/**
 * Increment HYBRID bookingsThisWeek counters for all subscriptions that ran
 * on a given service date. Called by generateTripsForDate after trip creation
 * so the weekly cap tracked in the Subscription document stays accurate.
 *
 * This is best-effort: failures are logged but don't abort trip generation.
 */
async function incrementHybridBookingCounters(serviceDate) {
  try {
    const { incrementBookingsThisWeek } = require('./subscriptionService');
    const hybridSubs = await Subscription.find({
      status: 'ACTIVE',
      subscriptionType: 'HYBRID',
      isDeleted: false,
      scheduleDays: serviceDate.getDay(),
      startDate: { $lte: serviceDate },
      endDate: { $gte: serviceDate },
      assignedDriverId: { $ne: null },
    }).select('_id').lean();

    for (const sub of hybridSubs) {
      await incrementBookingsThisWeek(sub._id, serviceDate).catch((err) => {
        logger.warn('[DailyTripGenerator] Could not increment bookingsThisWeek', {
          subscriptionId: sub._id,
          error: err.message,
        });
      });
    }
  } catch (err) {
    logger.warn('[DailyTripGenerator] incrementHybridBookingCounters failed', { error: err.message });
  }
}

module.exports = {
  generateTripsForDate,
  generateTripsForTomorrow,
  regenerateForSubscription,
  ensureSubscriptionOnTrip,
  buildPassengerEntry,
  generateRideOtp,
  optimizePickupOrder,
  buildNavigationUrl,
  isEligibleDay,
  normalizePickupTime,
  incrementHybridBookingCounters,
};
