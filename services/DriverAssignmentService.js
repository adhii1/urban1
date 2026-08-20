const Driver = require('../models/Driver');
const Area = require('../models/Area');
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
 * Find the active service area that contains the given pickup coordinates.
 */
async function findAreaForPickup(pickupCoordinates) {
  const [lng, lat] = pickupCoordinates;
  const areas = await Area.find({ status: 'ACTIVE' }).lean();
  for (const area of areas) {
    const dist = haversineKm([lng, lat], area.center.coordinates);
    if (dist <= area.radiusKm) return area;
  }
  return null;
}

/**
 * Finds the nearest drivers who can accommodate the given bundle size.
 * Prefers drivers assigned to the pickup's service area.
 */
async function findDriversForBundle(bundleRides, radiusKm = MATCH_RADIUS_KM) {
  if (!bundleRides || bundleRides.length === 0) return [];

  const requiredCapacity = bundleRides.length;
  const [lng, lat] = bundleRides[0].pickupLocation.coordinates;

  // Determine if pickup falls within a managed area
  const area = await findAreaForPickup([lng, lat]);

  logger.info('[BUNDLE_DEBUG] Searching drivers', {
    RequiredCapacity: requiredCapacity,
    PickupCoordinates: [lng, lat],
    Radius: radiusKm,
    AreaId: area?._id || null,
    AreaName: area?.name || null,
  });

  const baseFilter = {
    isOnline: true,
    isAvailable: true,
    isDeleted: false,
    vehicleCapacity: { $gte: requiredCapacity },
  };

  try {
    // If an area exists, first try drivers assigned to that area
    if (area) {
      const areaDrivers = await Driver.find({
        ...baseFilter,
        areaId: area._id,
        currentLocation: {
          $near: {
            $geometry: { type: 'Point', coordinates: [lng, lat] },
            $maxDistance: (area.radiusKm || radiusKm) * 1000,
          },
        },
      })
        .populate('userId', 'phone')
        .limit(MAX_DRIVERS_TO_NOTIFY)
        .lean();

      if (areaDrivers.length > 0) {
        logger.info('[BUNDLE_DEBUG] Area drivers found', { DriverCount: areaDrivers.length, AreaName: area.name });
        return areaDrivers
          .filter((d) => getDriverCoords(d))
          .map((d) => ({ ...d, distanceKm: haversineKm([lng, lat], getDriverCoords(d)) }));
      }
    }

    // Fallback: any nearby driver regardless of area assignment
    const drivers = await Driver.find({
      ...baseFilter,
      currentLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radiusKm * 1000,
        },
      },
    })
      .populate('userId', 'phone')
      .limit(MAX_DRIVERS_TO_NOTIFY)
      .lean();

    if (!drivers || drivers.length === 0) {
      logger.info('[BUNDLE_DEBUG] Geo query empty, trying non-geo fallback');
      const allOnline = await Driver.find(baseFilter)
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
        logger.info('[BUNDLE_DEBUG] Drivers found (fallback)', { DriverCount: nearby.length });
        return nearby;
      }
      logger.info('[BUNDLE_DEBUG] No drivers found');
      return [];
    }

    logger.info('[BUNDLE_DEBUG] Drivers found', { DriverCount: drivers.length });
    return drivers
      .filter((driver) => getDriverCoords(driver))
      .map((driver) => ({
        ...driver,
        distanceKm: haversineKm([lng, lat], getDriverCoords(driver)),
      }));
  } catch (err) {
    logger.error('Geospatial query failed in DriverAssignmentService, falling back', { error: err.message });

    const allDrivers = await Driver.find(baseFilter)
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
  findAreaForPickup,
};
