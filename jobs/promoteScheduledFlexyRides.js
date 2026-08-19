const { promoteDueFlexyRides } = require('../services/flexyService');
const logger = require('../utils/logger');

const CHECK_INTERVAL_MS = 60 * 1000;
let intervalRef = null;

/**
 * Promote due Flexy rides, then begin normal on-demand matching only for the
 * requests this invocation atomically transitioned to PENDING.
 */
async function runDueFlexyPromotion(now = new Date()) {
  const result = await promoteDueFlexyRides(now);

  if (result.promotedCount === 0) return result;

  logger.info('[FlexyPromotion] Promoted due Flexy rides', {
    promotedCount: result.promotedCount,
    rideRequestIds: result.promotedRideIds,
  });

  const bundleEngine = require('../services/BundleMatchingEngine');
  for (const rideRequestId of result.promotedRideIds) {
    bundleEngine.processNewRideRequest(rideRequestId).catch((error) => {
      logger.error('[FlexyPromotion] Failed to start matching for promoted ride', {
        rideRequestId,
        error: error.message,
      });
    });
  }

  return result;
}

function start() {
  if (intervalRef) return;

  logger.info('[FlexyPromotion] Starting due-time processor');
  intervalRef = setInterval(() => {
    runDueFlexyPromotion().catch((error) => {
      logger.error('[FlexyPromotion] Due-time processor failed', { error: error.message });
    });
  }, CHECK_INTERVAL_MS);
  intervalRef.unref?.();

  runDueFlexyPromotion().catch((error) => {
    logger.error('[FlexyPromotion] Initial due-time processor run failed', { error: error.message });
  });
}

function stop() {
  if (!intervalRef) return;
  clearInterval(intervalRef);
  intervalRef = null;
  logger.info('[FlexyPromotion] Stopped due-time processor');
}

module.exports = {
  CHECK_INTERVAL_MS,
  runDueFlexyPromotion,
  start,
  stop,
};
