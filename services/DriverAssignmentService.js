const Driver = require('../models/Driver');
const { haversineKm } = require('../utils/geoHelper');
const logger = require('../utils/logger');

const MATCH_RADIUS_KM = 5;
const MAX_DRIVERS_TO_NOTIFY = 1;

/**
 * Safely extract coordinates from a driver's currentLocation.
 */
function getDriverCoords(driver) {
  if (!driver || !driver.currentLocation) return null;
  const coords = driver.currentLocation.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return coords;
}

/**
 * Finds the nearest drivers who can accommodate the given bundle size.
 */
async function findDriversForBundle(bundleRides, radiusKm = MATCH_RADIUS_KM) {
  if (!bundleRides || bundleRides.length === 0) return [];

  const requiredCapacity = bundleRides.length;
  // Use the first ride's pickup as the center for driver search
  const [lng, lat] = bundleRides[0].pickupLocation.coordinates;

  logger.info('[BUNDLE_DEBUG] Searching drivers', {
    RequiredCapacity: requiredCapacity,
    PickupCoordinates: [lng, lat],
    Radius: radiusKm
  });

  try {
    const drivers = await Driver.find({
      currentLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radiusKm * 1000,
        },
      },
      isOnline: true,
      isAvailable: true,
      isDeleted: false,
      vehicleCapacity: { $gte: requiredCapacity },
    })
      .populate('userId', 'phone')
      .limit(MAX_DRIVERS_TO_NOTIFY)
      .lean();

    if (!drivers || drivers.length === 0) {
      // Geo query returned nothing — fall back to non-geo search (handles
      // missing 2dsphere index or drivers whose location wasn't geo-indexed yet)
      logger.info('[BUNDLE_DEBUG] Geo query empty, trying non-geo fallback');
      const allOnline = await Driver.find({
        isOnline: true,
        isAvailable: true,
        isDeleted: false,
        vehicleCapacity: { $gte: requiredCapacity },
      })
        .populate('userId', 'phone')
        .limit(MAX_DRIVERS_TO_NOTIFY * 5)
        .lean();

      const nearby = allOnline
        .filter((driver) => getDriverCoords(driver))
        .map((driver) => ({ ...driver, distanceKm: haversineKm([lng, lat], getDriverCoords(driver)) }))
        .filter((d) => d.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, MAX_DRIVERS_TO_NOTIFY);

      if (nearby.length > 0) {
        logger.info('[BUNDLE_DEBUG] Drivers found (fallback)', { DriverCount: nearby.length, DriverIds: nearby.map(d => d._id) });
        return nearby;
      }
      logger.info('[BUNDLE_DEBUG] No drivers found');
      return [];
    }

    logger.info('[BUNDLE_DEBUG] Drivers found', {
      DriverCount: drivers.length,
      DriverIds: drivers.map(d => d._id),
      Distances: drivers.map(d => getDriverCoords(d) ? haversineKm([lng, lat], getDriverCoords(d)) : null),
      VehicleCapacities: drivers.map(d => d.vehicleCapacity)
    });

    return drivers
      .filter((driver) => getDriverCoords(driver))
      .map((driver) => ({
        ...driver,
        distanceKm: haversineKm([lng, lat], getDriverCoords(driver)),
      }));
  } catch (err) {
    logger.error('Geospatial query failed in DriverAssignmentService, falling back', {
      error: err.message,
    });

    const allDrivers = await Driver.find({
      isOnline: true,
      isAvailable: true,
      isDeleted: false,
      vehicleCapacity: { $gte: requiredCapacity },
    })
      .populate('userId', 'phone')
      .limit(MAX_DRIVERS_TO_NOTIFY * 3)
      .lean();

    return allDrivers
      .filter((driver) => getDriverCoords(driver))
      .map((driver) => ({
        ...driver,
        distanceKm: haversineKm([lng, lat], getDriverCoords(driver)),
      }))
      .filter((d) => d.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, MAX_DRIVERS_TO_NOTIFY);
  }
}

module.exports = {
  findDriversForBundle,
};
