/**
 * Daily Trip Generator Job — Per PDF section 18
 * Runs hourly and generates trips for the next service day using the new
 * subscription-based matching system.
 * Also retains backward compat with legacy route-based tripGenerator.
 */
const { generateTripsForTomorrow } = require('../services/DailyTripGenerator');
const logger = require('../utils/logger');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let intervalRef = null;

async function runDailyTripGeneration() {
  try {
    const result = await generateTripsForTomorrow();
    logger.info('[DailyTripGeneration] Completed', {
      serviceDate: result.serviceDate,
      createdTrips: result.createdTrips,
      passengers: result.passengers,
    });
    return result;
  } catch (error) {
    logger.error('[DailyTripGeneration] Generation failed', { error: error.message });
    return { createdTrips: 0, passengers: 0 };
  }
}

function start() {
  if (intervalRef) return;
  logger.info('[DailyTripGeneration] Starting subscription-based trip generator (hourly)');
  intervalRef = setInterval(() => {
    runDailyTripGeneration();
  }, CHECK_INTERVAL_MS);
  intervalRef.unref?.();
  // Run immediately on startup
  runDailyTripGeneration();
}

function stop() {
  if (!intervalRef) return;
  clearInterval(intervalRef);
  intervalRef = null;
  logger.info('[DailyTripGeneration] Stopped');
}

module.exports = {
  CHECK_INTERVAL_MS,
  runDailyTripGeneration,
  start,
  stop,
};
