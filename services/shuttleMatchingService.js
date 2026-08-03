const RideRequest = require('../models/RideRequest');
const Driver = require('../models/Driver');
const { haversineKm } = require('../utils/geoHelper');
const logger = require('../utils/logger');

const DEFAULT_RADIUS_KM = 5;
const MAX_LISTING_RESULTS = 20;

async function findNearbyRideRequests(
  driverLocation,
  options = {}
) {
  const {
    radiusKm = DEFAULT_RADIUS_KM,
    maxResults = MAX_LISTING_RESULTS,
    excludeRideRequestIds = [],
  } = options;

  const [lng, lat] = driverLocation;

  try {
    const query = {
      pickupLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radiusKm * 1000,
        },
      },
      status: 'PENDING',
      isDeleted: false,
    };

    if (excludeRideRequestIds.length > 0) {
      query._id = { $nin: excludeRideRequestIds };
    }

    const rides = await RideRequest.find(query)
      .populate('customerId', 'name phone')
      .limit(maxResults)
      .lean();

    return rides
      .map((ride) => ({
        rideRequestId: ride._id,
        customerId: ride.customerId?._id || ride.customerId,
        customerName: ride.customerName || ride.customerId?.name || 'Unknown',
        customerPhone: ride.customerPhone,
        pickup: {
          address: ride.pickupLocation.address,
          coordinates: ride.pickupLocation.coordinates,
        },
        drop: {
          address: ride.dropLocation.address,
          coordinates: ride.dropLocation.coordinates,
        },
        stops: ride.stops || [],
        fareEstimate: ride.fare?.estimated,
        tripDistance: ride.fare?.details?.distanceKm,
        expiresAt: ride.expiresAt,
        requestedAt: ride.requestedAt,
        distanceKm: haversineKm(
          driverLocation,
          ride.pickupLocation.coordinates
        ),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  } catch (err) {
    logger.error('findNearbyRideRequests geospatial query failed', {
      error: err.message,
    });

    const fallbackQuery = {
      status: 'PENDING',
      isDeleted: false,
    };

    if (excludeRideRequestIds.length > 0) {
      fallbackQuery._id = { $nin: excludeRideRequestIds };
    }

    const rides = await RideRequest.find(fallbackQuery)
      .populate('customerId', 'name phone')
      .limit(maxResults * 3)
      .lean();

    const withDistance = rides
      .map((ride) => ({
        rideRequestId: ride._id,
        customerId: ride.customerId?._id || ride.customerId,
        customerName: ride.customerName || ride.customerId?.name || 'Unknown',
        customerPhone: ride.customerPhone,
        pickup: {
          address: ride.pickupLocation.address,
          coordinates: ride.pickupLocation.coordinates,
        },
        drop: {
          address: ride.dropLocation.address,
          coordinates: ride.dropLocation.coordinates,
        },
        stops: ride.stops || [],
        fareEstimate: ride.fare?.estimated,
        tripDistance: ride.fare?.details?.distanceKm,
        expiresAt: ride.expiresAt,
        requestedAt: ride.requestedAt,
        distanceKm: haversineKm(driverLocation, ride.pickupLocation.coordinates),
      }))
      .filter((r) => r.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, maxResults);

    return withDistance;
  }
}

async function getRideRequestCountNearby(driverLocation, radiusKm = DEFAULT_RADIUS_KM) {
  const [lng, lat] = driverLocation;

  try {
    const count = await RideRequest.countDocuments({
      pickupLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radiusKm * 1000,
        },
      },
      status: 'PENDING',
      isDeleted: false,
    });
    return count;
  } catch (err) {
    const count = await RideRequest.countDocuments({
      status: 'PENDING',
      isDeleted: false,
    });
    return count;
  }
}

module.exports = {
  findNearbyRideRequests,
  getRideRequestCountNearby,
  DEFAULT_RADIUS_KM,
  MAX_LISTING_RESULTS,
};