/**
 * Trip Generator Service
 * 
 * For Hybrid/Weekday/Standard (shared shuttle) plans:
 * - Runs daily at a configurable time (default: early morning)
 * - Finds all active subscriptions for today (based on allowed weekdays)
 * - Groups customers by route
 * - Finds the driver assigned to each route
 * - Creates Trip documents with a manifest of all customers on that route
 * - If a customer changes route, they get auto-assigned to the new route's trip
 */

const Subscription = require('../models/Subscription');
const Customer = require('../models/Customer');
const Driver = require('../models/Driver');
const Route = require('../models/Route');
const Trip = require('../models/Trip');
const Plan = require('../models/Plan');
const logger = require('../utils/logger');

let intervalRef = null;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check every hour
let lastGeneratedDate = null;

/**
 * Generate today's trips for all shared-ride subscriptions.
 */
async function generateTripsForToday() {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Don't regenerate if already done today
  if (lastGeneratedDate === todayStr) return;

  const dayOfWeek = today.getDay(); // 0=Sun...6=Sat

  try {
    // Find all ACTIVE subscriptions with shared-ride plans
    const subscriptions = await Subscription.find({
      status: 'ACTIVE',
      startDate: { $lte: today },
      endDate: { $gte: today },
      isDeleted: false,
    }).populate('planId').populate('customerId');

    if (subscriptions.length === 0) {
      lastGeneratedDate = todayStr;
      return;
    }

    // Filter subscriptions eligible for today
    const eligibleSubs = subscriptions.filter(sub => {
      const plan = sub.planId;
      if (!plan || !plan.bookingRules?.isSharedRide) return false;

      // Check if today is allowed
      if (plan.tier === 'Weekday') {
        return [1, 2, 3, 4, 5].includes(dayOfWeek); // Mon-Fri
      } else if (plan.tier === 'Hybrid') {
        const selectedDays = sub.selectedWeekdays || [];
        return selectedDays.includes(dayOfWeek);
      } else if (plan.bookingRules?.isAlternateDay) {
        const startDate = new Date(sub.startDate);
        const daysSinceStart = Math.floor((today - startDate) / (24 * 60 * 60 * 1000));
        return daysSinceStart % 2 === 0;
      }
      // Standard: all days
      return true;
    });

    if (eligibleSubs.length === 0) {
      lastGeneratedDate = todayStr;
      return;
    }

    logger.info(`[TripGenerator] ${eligibleSubs.length} subscriptions eligible for today (${todayStr})`);

    // Group by routeId
    const routeGroups = {};
    for (const sub of eligibleSubs) {
      const routeId = sub.routeId?.toString();
      if (!routeId) continue;
      if (!routeGroups[routeId]) routeGroups[routeId] = [];
      routeGroups[routeId].push(sub);
    }

    // For each route, create a trip if one doesn't already exist today
    for (const [routeId, subs] of Object.entries(routeGroups)) {
      // Check if trip already exists for today on this route
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);

      const existingTrip = await Trip.findOne({
        routeId,
        tripDate: { $gte: todayStart, $lte: todayEnd },
        isDeleted: false,
      });

      if (existingTrip) {
        // Update manifest if new customers subscribed
        const existingCustomerIds = existingTrip.manifest.map(m => m.customer.toString());
        const newSubs = subs.filter(s => !existingCustomerIds.includes(s.customerId._id.toString()));

        if (newSubs.length > 0) {
          const route = await Route.findById(routeId);
          for (const sub of newSubs) {
            const pickupStop = route?.stops?.[sub.pickupStopIndex] || route?.stops?.[0];
            const dropStop = route?.stops?.[sub.dropStopIndex] || route?.stops?.[route.stops.length - 1];

            existingTrip.manifest.push({
              customer: sub.customerId._id,
              pickupStop: pickupStop ? {
                stopName: pickupStop.stopName,
                sequenceOrder: pickupStop.sequenceOrder,
                location: pickupStop.location,
              } : undefined,
              dropStop: dropStop ? {
                stopName: dropStop.stopName,
                sequenceOrder: dropStop.sequenceOrder,
                location: dropStop.location,
              } : undefined,
              status: 'PENDING',
            });
          }
          await existingTrip.save();
          logger.info(`[TripGenerator] Updated trip ${existingTrip._id} with ${newSubs.length} new passengers`);
        }
        continue;
      }

      // Prefer the route's explicitly assigned driver. The fallback preserves
      // existing routes created before assignedDriver was introduced.
      const route = await Route.findById(routeId);
      if (!route) continue;
      const driver = route.assignedDriver
        ? await Driver.findOne({ _id: route.assignedDriver, status: 'ACTIVE', isDeleted: false })
        : await Driver.findOne({ routeId, status: 'ACTIVE', isDeleted: false });

      // Build manifest
      const manifest = subs.map(sub => {
        const pickupStop = route.stops?.[sub.pickupStopIndex] || route.stops?.[0];
        const dropStop = route.stops?.[sub.dropStopIndex] || route.stops?.[route.stops.length - 1];

        return {
          customer: sub.customerId._id,
          pickupStop: pickupStop ? {
            stopName: pickupStop.stopName,
            sequenceOrder: pickupStop.sequenceOrder,
            location: pickupStop.location,
          } : undefined,
          dropStop: dropStop ? {
            stopName: dropStop.stopName,
            sequenceOrder: dropStop.sequenceOrder,
            location: dropStop.location,
          } : undefined,
          status: 'PENDING',
        };
      });

      // Create the trip
      const trip = await Trip.create({
        routeId,
        driverId: driver?._id || null,
        tripDate: today,
        manifest,
        status: 'SCHEDULED',
      });

      // Increment bookingsThisWeek for hybrid subs
      for (const sub of subs) {
        if (sub.planId?.tier === 'Hybrid') {
          await Subscription.findByIdAndUpdate(sub._id, { $inc: { bookingsThisWeek: 1 } });
        }
      }

      logger.info(`[TripGenerator] Created trip ${trip._id} on route ${route.name} with ${manifest.length} passengers` +
        (driver ? ` assigned to driver ${driver.name}` : ' (no driver assigned)'));
    }

    lastGeneratedDate = todayStr;
    logger.info(`[TripGenerator] Trip generation complete for ${todayStr}`);
  } catch (err) {
    logger.error('[TripGenerator] Error generating trips', { error: err.message });
  }
}

/**
 * Handle when a customer changes their route subscription.
 * Removes them from old route's trip and adds to new route's trip.
 */
async function handleRouteChange(customerId, oldRouteId, newRouteId, subscription) {
  const today = new Date();
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  try {
    // Remove from old route's trip
    if (oldRouteId) {
      const oldTrip = await Trip.findOne({
        routeId: oldRouteId,
        tripDate: { $gte: todayStart, $lte: todayEnd },
        status: 'SCHEDULED',
        isDeleted: false,
      });

      if (oldTrip) {
        oldTrip.manifest = oldTrip.manifest.filter(
          m => m.customer.toString() !== customerId.toString()
        );
        await oldTrip.save();
        logger.info(`[TripGenerator] Removed customer ${customerId} from trip ${oldTrip._id}`);
      }
    }

    // Add to new route's trip
    if (newRouteId) {
      let newTrip = await Trip.findOne({
        routeId: newRouteId,
        tripDate: { $gte: todayStart, $lte: todayEnd },
        status: 'SCHEDULED',
        isDeleted: false,
      });

      const route = await Route.findById(newRouteId);
      if (!route) return;

      const pickupStop = route.stops?.[subscription?.pickupStopIndex] || route.stops?.[0];
      const dropStop = route.stops?.[subscription?.dropStopIndex] || route.stops?.[route.stops.length - 1];

      const manifestEntry = {
        customer: customerId,
        pickupStop: pickupStop ? {
          stopName: pickupStop.stopName,
          sequenceOrder: pickupStop.sequenceOrder,
          location: pickupStop.location,
        } : undefined,
        dropStop: dropStop ? {
          stopName: dropStop.stopName,
          sequenceOrder: dropStop.sequenceOrder,
          location: dropStop.location,
        } : undefined,
        status: 'PENDING',
      };

      if (newTrip) {
        newTrip.manifest.push(manifestEntry);
        await newTrip.save();
      } else {
        // Create new trip for this route if none exists
        const driver = await Driver.findOne({ routeId: newRouteId, status: 'ACTIVE', isDeleted: false });
        newTrip = await Trip.create({
          routeId: newRouteId,
          driverId: driver?._id || null,
          tripDate: today,
          manifest: [manifestEntry],
          status: 'SCHEDULED',
        });
      }

      logger.info(`[TripGenerator] Added customer ${customerId} to trip ${newTrip._id} on new route`);
    }
  } catch (err) {
    logger.error('[TripGenerator] Error handling route change', { error: err.message });
  }
}

function start() {
  if (intervalRef) return;
  logger.info('[TripGenerator] Starting trip generator service');
  // Run immediately
  generateTripsForToday();
  intervalRef = setInterval(generateTripsForToday, CHECK_INTERVAL_MS);
}

function stop() {
  if (intervalRef) {
    clearInterval(intervalRef);
    intervalRef = null;
    logger.info('[TripGenerator] Stopped');
  }
}

module.exports = { start, stop, generateTripsForToday, handleRouteChange };
