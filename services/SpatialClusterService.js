const RideRequest = require('../models/RideRequest');
const { haversineKm } = require('../utils/geoHelper');

/**
 * Finds all compatible PENDING rides that can be bundled with the given primary ride.
 * Compatible means:
 * - Pickup is within maxDistanceKm
 * - Drop is within maxDistanceKm
 * - Ride is not currently bundled or dispatched
 */
async function findCompatibleRides(primaryRide, maxDistanceKm = 5) {
  const [lng, lat] = primaryRide.pickupLocation.coordinates;
  
  // Find all PENDING, unbundled rides nearby
  const candidates = await RideRequest.find({
    _id: { $ne: primaryRide._id },
    status: 'PENDING',
    isDeleted: false,
    isBundled: { $ne: true },
    pickupLocation: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: maxDistanceKm * 1000,
      }
    }
  }).lean();

  const compatible = [];
  
  for (const candidate of candidates) {
    // We already know pickup is within maxDistanceKm because of the $near query.
    // Now verify the drop location is also within maxDistanceKm.
    const dropDist = haversineKm(
      primaryRide.dropLocation.coordinates,
      candidate.dropLocation.coordinates
    );

    if (dropDist <= maxDistanceKm) {
      compatible.push({
        ...candidate,
        pickupDistanceToPrimary: haversineKm(
          primaryRide.pickupLocation.coordinates,
          candidate.pickupLocation.coordinates
        ),
        dropDistanceToPrimary: dropDist,
      });
    }
  }

  return compatible;
}

/**
 * Generates compatible bundles up to the maximum supported vehicle capacity.
 * A bundle is valid only when every passenger is close enough to the primary
 * passenger and to every other passenger, for both pickup and destination.
 */
function generateBundles(primaryRide, compatibleRides) {
  const maxPassengers = 6;
  const bundles = [];
  const bundle = [primaryRide];

  for (const candidate of compatibleRides) {
    if (bundle.length >= maxPassengers) break;
    const compatibleWithBundle = bundle.every((ride) => {
      const pickupDistance = haversineKm(
        ride.pickupLocation.coordinates,
        candidate.pickupLocation.coordinates
      );
      const dropDistance = haversineKm(
        ride.dropLocation.coordinates,
        candidate.dropLocation.coordinates
      );
      return pickupDistance <= 5 && dropDistance <= 5;
    });

    if (compatibleWithBundle) bundle.push(candidate);
  }

  if (bundle.length > 1) bundles.push(bundle);
  return bundles;
}

module.exports = {
  findCompatibleRides,
  generateBundles
};
