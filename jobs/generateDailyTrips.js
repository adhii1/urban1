const { generateForServiceDate, normalizeServiceDate } = require('../services/tripGenerator');
const logger = require('../utils/logger');

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
let intervalRef = null;

function nextLocalServiceDate(now = new Date()) {
  const serviceDate = normalizeServiceDate(now);
  serviceDate.setDate(serviceDate.getDate() + 1);
  return serviceDate;
}

/** Generate the next local operating day's recurring service. */
async function runDailyTripGeneration(now = new Date()) {
  const serviceDate = nextLocalServiceDate(now);
  const result = await generateForServiceDate(serviceDate);
  logger.info('[DailyTripGeneration] Completed', {
    serviceDate,
    createdTrips: result.createdTrips,
    updatedTrips: result.updatedTrips,
    manifestEntries: result.manifestEntries,
    exceptionCount: result.exceptions.length,
  });
  return result;
}

function start() {
  if (intervalRef) return;
  logger.info('[DailyTripGeneration] Starting next-day trip generator');
  intervalRef = setInterval(() => {
    runDailyTripGeneration().catch((error) => {
      logger.error('[DailyTripGeneration] Generation failed', { error: error.message });
    });
  }, CHECK_INTERVAL_MS);
  intervalRef.unref?.();
  runDailyTripGeneration().catch((error) => {
    logger.error('[DailyTripGeneration] Initial generation failed', { error: error.message });
  });
}

function stop() {
  if (!intervalRef) return;
  clearInterval(intervalRef);
  intervalRef = null;
  logger.info('[DailyTripGeneration] Stopped');
}

module.exports = {
  CHECK_INTERVAL_MS,
  nextLocalServiceDate,
  runDailyTripGeneration,
  start,
  stop,
};
