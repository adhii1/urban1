const { haversineKm, getAverageSpeed } = require('../utils/geoHelper');
const logger = require('../utils/logger');

// ============================================
// FARE CONFIGURATION
// ============================================
const FARE_CONFIG = {
  baseFare: 25,            // Base fare in INR
  perKmRate: 12,           // Rate per kilometer
  perMinuteRate: 1.5,      // Rate per minute (for time component)
  minimumFare: 40,         // Minimum fare
  surgeMultiplier: 1.0,    // Default (no surge)
  waitingChargePerMin: 2,  // Waiting charge after 3 minutes
  nightChargeMultiplier: 1.25, // 25% extra between 10 PM - 5 AM
};

// ============================================
// DEMAND-BASED SURGE ZONES
// ============================================
// Surge thresholds based on active ride requests per km²
const SURGE_TIERS = [
  { minRequests: 0, maxRequests: 5, multiplier: 1.0, label: null },
  { minRequests: 6, maxRequests: 10, multiplier: 1.25, label: 'High demand' },
  { minRequests: 11, maxRequests: 20, multiplier: 1.5, label: 'Very high demand' },
  { minRequests: 21, maxRequests: Infinity, multiplier: 2.0, label: 'Peak demand' },
];

/**
 * Check if current time falls in night hours (10 PM - 5 AM)
 */
function isNightTime(timestamp = new Date()) {
  const hour = new Date(timestamp).getHours();
  return hour >= 22 || hour < 5;
}

/**
 * Calculate surge multiplier based on active ride requests in the area.
 * Uses a simple grid-based density approach.
 */
async function calculateSurgeMultiplier(pickupCoordinates, RideRequestModel) {
  try {
    const [lng, lat] = pickupCoordinates;
    const radiusMeters = 2000; // 2 km radius for demand calculation

    // Count active ride requests within radius
    // NOTE: countDocuments() uses aggregation internally, and in MongoDB 8.x
    // $geoWithin + $centerSphere is also rejected in aggregation pipelines.
    // Use find() + .length instead, which issues a regular MongoDB find command
    // where $geoWithin + $centerSphere is fully supported.
    const radiusInRadians = radiusMeters / 6378100; // Earth radius in metres
    const activeRides = await RideRequestModel.find({
      status: { $in: ['PENDING', 'ACCEPTED', 'DRIVER_ARRIVING'] },
      isDeleted: false,
      'pickupLocation.coordinates': {
        $geoWithin: {
          $centerSphere: [[lng, lat], radiusInRadians],
        },
      },
    })
      .select('_id')
      .limit(100)
      .lean();

    const activeCount = activeRides.length;

    // Find matching surge tier
    const tier = SURGE_TIERS.find(
      (t) => activeCount >= t.minRequests && activeCount <= t.maxRequests
    );

    return tier || SURGE_TIERS[0];
  } catch (err) {
    logger.error('Failed to calculate surge multiplier', { error: err.message });
    return SURGE_TIERS[0]; // Default: no surge
  }
}

/**
 * Estimate fare for a ride from pickup to drop.
 * Returns detailed fare breakdown.
 */
async function estimateFare(pickupCoords, dropCoords, stops = [], timestamp = new Date(), RideRequestModel = null) {
  // Calculate total distance
  let totalDistanceKm = haversineKm(pickupCoords, dropCoords);

  // Add distance for intermediate stops
  let prevCoords = pickupCoords;
  for (const stop of stops) {
    if (stop.coordinates) {
      totalDistanceKm += haversineKm(prevCoords, stop.coordinates);
      prevCoords = stop.coordinates;
    }
  }

  // Calculate duration
  const hour = new Date(timestamp).getHours();
  const avgSpeed = getAverageSpeed(hour);
  const durationMinutes = Math.max(1, Math.round((totalDistanceKm / avgSpeed) * 60));

  // Base fare components
  const distanceCharge = totalDistanceKm * FARE_CONFIG.perKmRate;
  const timeCharge = durationMinutes * FARE_CONFIG.perMinuteRate;
  let subtotal = FARE_CONFIG.baseFare + distanceCharge + timeCharge;

  // Night charge
  let nightCharge = 0;
  if (isNightTime(timestamp)) {
    nightCharge = subtotal * (FARE_CONFIG.nightChargeMultiplier - 1);
    subtotal += nightCharge;
  }

  // Surge pricing
  let surgeMultiplier = 1.0;
  let surgeLabel = null;
  if (RideRequestModel) {
    const tier = await calculateSurgeMultiplier(pickupCoords, RideRequestModel);
    surgeMultiplier = tier.multiplier;
    surgeLabel = tier.label;
  }
  const surgeCharge = subtotal * (surgeMultiplier - 1);
  subtotal += surgeCharge;

  // Apply minimum fare
  const estimatedFare = Math.max(FARE_CONFIG.minimumFare, Math.round(subtotal));

  return {
    estimated: estimatedFare,
    breakdown: {
      baseFare: FARE_CONFIG.baseFare,
      distanceCharge: Math.round(distanceCharge),
      timeCharge: Math.round(timeCharge),
      nightCharge: Math.round(nightCharge),
      surgeCharge: Math.round(surgeCharge),
    },
    details: {
      distanceKm: Math.round(totalDistanceKm * 100) / 100,
      durationMinutes,
      surgeMultiplier,
      surgeLabel,
      isNightTime: isNightTime(timestamp),
    },
  };
}

/**
 * Calculate final fare based on actual trip data.
 * Includes validation to ensure fare doesn't deviate significantly from estimate.
 */
function calculateFinalFare(actualDistanceKm, actualDurationMinutes, fareEstimate, timestamp = new Date()) {
  let finalFare = fareEstimate?.estimated || FARE_CONFIG.minimumFare;

  // Adjust if actual distance differs by more than 20%
  const estimatedDistance = fareEstimate?.details?.distanceKm || actualDistanceKm;
  const distanceRatio = actualDistanceKm / estimatedDistance;

  if (distanceRatio > 1.2) {
    // Actual distance is significantly more — adjust proportionally
    const extraDistanceCharge = (actualDistanceKm - estimatedDistance) * FARE_CONFIG.perKmRate;
    finalFare += Math.round(extraDistanceCharge);
  } else if (distanceRatio < 0.8) {
    // Actual distance is significantly less — reduce fare
    const reducedDistanceCharge = (estimatedDistance - actualDistanceKm) * FARE_CONFIG.perKmRate;
    finalFare -= Math.round(reducedDistanceCharge);
  }

  // Apply minimum fare
  finalFare = Math.max(FARE_CONFIG.minimumFare, finalFare);

  // Validate final fare doesn't deviate more than 30% from estimate
  const estimatedFare = fareEstimate?.estimated || 0;
  if (estimatedFare > 0) {
    const deviation = Math.abs(finalFare - estimatedFare) / estimatedFare;
    if (deviation > 0.3) {
      logger.warn('Final fare deviates significantly from estimate', {
        estimated: estimatedFare,
        final: finalFare,
        deviation: (deviation * 100).toFixed(2) + '%',
      });
    }
  }

  return finalFare;
}

/**
 * Calculate cancellation fee based on timing
 * Free cancellation within 2 minutes, then progressive fee
 */
function calculateCancellationFee(requestedAt, cancelledAt, fareEstimate) {
  const timeSinceRequest = new Date(cancelledAt) - new Date(requestedAt);
  const minutesSinceRequest = timeSinceRequest / 60000;

  // Free cancellation within 2 minutes
  if (minutesSinceRequest <= 2) {
    return 0;
  }

  // After 2 minutes: 20% of estimated fare, capped at ₹100
  const cancellationFee = Math.min(
    Math.round((fareEstimate?.estimated || 100) * 0.2),
    100
  );

  return cancellationFee;
}

module.exports = {
  FARE_CONFIG,
  SURGE_TIERS,
  estimateFare,
  calculateFinalFare,
  calculateCancellationFee,
  calculateSurgeMultiplier,
  isNightTime,
};
