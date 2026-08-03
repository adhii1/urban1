/**
 * BundleScoringService
 * 
 * Scores bundles based on how efficient they are.
 * Factors:
 * - Capacity utilization: Larger bundles are better (up to vehicle max).
 * - Pickup distance: Closer pickups are better.
 * - Drop distance: Closer drops are better.
 * - Minimum detour: A straight line is better than backtracking.
 */

const { haversineKm } = require('../utils/geoHelper');

function scoreBundle(bundleRides) {
  if (bundleRides.length <= 1) return 0; // No bundle

  const size = bundleRides.length;
  
  // Calculate average pairwise distance between pickups
  let totalPickupDist = 0;
  let totalDropDist = 0;
  let pairs = 0;

  for (let i = 0; i < size; i++) {
    for (let j = i + 1; j < size; j++) {
      totalPickupDist += haversineKm(
        bundleRides[i].pickupLocation.coordinates,
        bundleRides[j].pickupLocation.coordinates
      );
      totalDropDist += haversineKm(
        bundleRides[i].dropLocation.coordinates,
        bundleRides[j].dropLocation.coordinates
      );
      pairs++;
    }
  }

  const avgPickupDist = pairs > 0 ? totalPickupDist / pairs : 0;
  const avgDropDist = pairs > 0 ? totalDropDist / pairs : 0;

  // We want to maximize size and minimize distance.
  // Base score based on size: 100 for size 2, 200 for size 3, etc.
  let score = (size - 1) * 100;

  // Penalize for distances (e.g., -10 points per km of average distance)
  score -= (avgPickupDist * 10);
  score -= (avgDropDist * 10);

  // Bonus for same-location pickups/drops (e.g., avgDist < 0.5km)
  if (avgPickupDist < 0.5) score += 20;
  if (avgDropDist < 0.5) score += 20;

  // Waiting time could also be considered here if we track how long a ride has been PENDING
  // e.g. adding points for rides that have been waiting longer.
  const maxWaitMs = Math.max(...bundleRides.map(r => Date.now() - (r.requestedAt || r.createdAt)));
  const maxWaitMins = Math.round(maxWaitMs / 60000);
  
  // Add 5 points per minute of waiting, to prioritize older requests
  score += (maxWaitMins * 5);

  return score;
}

/**
 * Returns the best bundle from a list of generated bundles.
 */
function getBestBundle(bundles) {
  if (!bundles || bundles.length === 0) return null;

  let bestBundle = bundles[0];
  let bestScore = scoreBundle(bestBundle);

  for (let i = 1; i < bundles.length; i++) {
    const currentScore = scoreBundle(bundles[i]);
    if (currentScore > bestScore) {
      bestScore = currentScore;
      bestBundle = bundles[i];
    }
  }

  return { bundle: bestBundle, score: bestScore };
}

module.exports = {
  scoreBundle,
  getBestBundle
};
