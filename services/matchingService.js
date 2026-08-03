const Driver = require('../models/Driver');
const { haversineKm } = require('../utils/geoHelper');
const logger = require('../utils/logger');

const MATCH_RADIUS_KM = 5;
const MAX_DRIVERS_TO_NOTIFY = 10;

/**
 * Safely extract coordinates from a driver's currentLocation.
 * Returns null if coordinates are missing or invalid.
 */
function getDriverCoords(driver) {
  if (!driver || !driver.currentLocation) return null;
  const coords = driver.currentLocation.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return coords;
}

async function findNearbyDrivers(pickupCoordinates, radiusKm = MATCH_RADIUS_KM) {
  const [lng, lat] = pickupCoordinates;

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
    })
      .populate('userId', 'phone')
      .limit(MAX_DRIVERS_TO_NOTIFY)
      .lean();

    return drivers
      .filter((driver) => getDriverCoords(driver))
      .map((driver) => ({
        ...driver,
        distanceKm: haversineKm([lng, lat], getDriverCoords(driver)),
      }));
  } catch (err) {
    logger.error('Geospatial query failed, falling back to in-memory matching', {
      error: err.message,
    });

    const allDrivers = await Driver.find({
      isOnline: true,
      isAvailable: true,
      isDeleted: false,
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

function isWithinRadius(pickupCoords, dropCoords, radiusKm = MATCH_RADIUS_KM) {
  const distance = haversineKm(pickupCoords, dropCoords);
  return distance <= radiusKm;
}

module.exports = { findNearbyDrivers, isWithinRadius, MATCH_RADIUS_KM };
