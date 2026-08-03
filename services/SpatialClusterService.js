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
 * Generates possible bundles from a primary ride and compatible candidates.
 * For simplicity, we create bundles up to size 6 (max SUV capacity).
 */
function generateBundles(primaryRide, compatibleRides) {
  const bundles = [];
  
  // Create all pairs (size 2)
  for (const ride2 of compatibleRides) {
    bundles.push([primaryRide, ride2]);
    
    // Create triples (size 3)
    for (const ride3 of compatibleRides) {
      if (ride2._id.toString() === ride3._id.toString()) continue;
      
      // Ensure ride2 and ride3 are also compatible with each other
      const pickupDist = haversineKm(ride2.pickupLocation.coordinates, ride3.pickupLocation.coordinates);
      const dropDist = haversineKm(ride2.dropLocation.coordinates, ride3.dropLocation.coordinates);
      
      if (pickupDist <= 5 && dropDist <= 5) {
        bundles.push([primaryRide, ride2, ride3]);
      }
    }
  }

  return bundles;
}

module.exports = {
  findCompatibleRides,
  generateBundles
};
