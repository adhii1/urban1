/**
 * Scheduled Dispatch Service
 * 
 * Handles Flexi plan advance bookings:
 * - Customer books 2+ hours ahead with a scheduledPickupTime
 * - Ride is created with status SCHEDULED (not dispatched immediately)
 * - This service runs every minute and dispatches rides 30-45 minutes before pickup time
 * - Once dispatched, the ride transitions to PENDING and the BundleMatchingEngine takes over
 * 
 * This ensures drivers are matched close to pickup time, not hours before.
 */

const RideRequest = require('../models/RideRequest');
const logger = require('../utils/logger');

// How many minutes before scheduled pickup to dispatch the ride to drivers
const DISPATCH_LEAD_TIME_MINUTES = 40; // Dispatch 40 min before pickup
const CHECK_INTERVAL_MS = 60 * 1000; // Check every 1 minute

let intervalRef = null;

/**
 * Find SCHEDULED rides whose pickup time is approaching and dispatch them.
 */
async function dispatchScheduledRides() {
  try {
    const now = new Date();
    const dispatchCutoff = new Date(now.getTime() + DISPATCH_LEAD_TIME_MINUTES * 60 * 1000);

    // Find rides that are SCHEDULED and whose scheduledPickupTime is within the next N minutes
    const ridesToDispatch = await RideRequest.find({
      status: 'SCHEDULED',
      scheduledPickupTime: { $lte: dispatchCutoff },
      isDeleted: false,
    });

    if (ridesToDispatch.length === 0) return;

    logger.info(`[ScheduledDispatch] Found ${ridesToDispatch.length} rides to dispatch`);

    const bundleEngine = require('./BundleMatchingEngine');

    for (const ride of ridesToDispatch) {
      // Transition from SCHEDULED → PENDING (now actively looking for drivers)
      ride.status = 'PENDING';
      ride.requestedAt = new Date(); // Reset so expiry timer starts fresh
      ride.expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min to find a driver
      await ride.save();

      logger.info(`[ScheduledDispatch] Dispatching ride ${ride._id} | Pickup at: ${ride.scheduledPickupTime}`);

      // Trigger the matching engine (same flow as immediate rides)
      bundleEngine.processNewRideRequest(ride._id).catch(err => {
        logger.error(`[ScheduledDispatch] Failed to dispatch ride ${ride._id}`, { error: err.message });
      });

      // Notify customer that their ride is being matched
      const { emitToUser } = require('../config/socket');
      emitToUser('customer', ride.customerId.toString(), 'ride:request:ack', {
        rideRequestId: ride._id,
        message: 'Finding a driver for your scheduled ride...',
        fareEstimate: ride.fare?.estimated,
      });
    }
  } catch (err) {
    logger.error('[ScheduledDispatch] Error in dispatch cycle', { error: err.message });
  }
}

function start() {
  if (intervalRef) return;
  logger.info('[ScheduledDispatch] Starting scheduled dispatch service');
  intervalRef = setInterval(dispatchScheduledRides, CHECK_INTERVAL_MS);
  // Run immediately on start
  dispatchScheduledRides();
}

function stop() {
  if (intervalRef) {
    clearInterval(intervalRef);
    intervalRef = null;
    logger.info('[ScheduledDispatch] Stopped');
  }
}

module.exports = { start, stop, dispatchScheduledRides, DISPATCH_LEAD_TIME_MINUTES };
