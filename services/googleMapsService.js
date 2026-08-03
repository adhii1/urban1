/**
 * Google Maps Integration Service
 * Provides accurate ETA and distance calculations using Google Maps API
 * 
 * SETUP:
 * 1. Get a Google Maps API key from https://console.cloud.google.com/
 * 2. Enable "Distance Matrix API" and "Directions API"
 * 3. Set GOOGLE_MAPS_API_KEY in your .env file
 * 4. Set USE_GOOGLE_MAPS=true to enable this service
 * 
 * COST:
 * - Distance Matrix API: $5 per 1000 requests
 * - Estimated cost for 1000 rides/day: ~$150/month
 * 
 * FALLBACK:
 * If Google Maps is disabled or fails, the system automatically falls back
 * to haversine distance calculation with time-based speed adjustment
 */

const axios = require('axios');
const { haversineKm, getAverageSpeed } = require('../utils/geoHelper');
const logger = require('../utils/logger');
const config = require('../config/config');

const GOOGLE_MAPS_API_KEY = config.google?.mapsApiKey || process.env.GOOGLE_MAPS_API_KEY;
const USE_GOOGLE_MAPS = process.env.USE_GOOGLE_MAPS === 'true';

/**
 * Calculate distance and ETA using Google Maps Distance Matrix API
 * @param {Array} origin - [longitude, latitude]
 * @param {Array} destination - [longitude, latitude]
 * @param {Date} departureTime - When the trip starts
 * @returns {Promise<{distanceKm: number, durationMinutes: number, source: string}>}
 */
async function getDistanceAndETA(origin, destination, departureTime = new Date()) {
  if (!USE_GOOGLE_MAPS || !GOOGLE_MAPS_API_KEY) {
    return calculateFallback(origin, destination, departureTime);
  }

  try {
    const [originLng, originLat] = origin;
    const [destLng, destLat] = destination;

    const originStr = `${originLat},${originLng}`;
    const destStr = `${destLat},${destLng}`;

    const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
      params: {
        origins: originStr,
        destinations: destStr,
        departure_time: Math.floor(departureTime.getTime() / 1000),
        key: GOOGLE_MAPS_API_KEY,
        mode: 'driving',
        traffic_model: 'best_guess',
      },
      timeout: 5000,
    });

    const data = response.data;

    if (data.status !== 'OK' || !data.rows || !data.rows[0] || !data.rows[0].elements[0]) {
      logger.warn('Google Maps API returned invalid response, using fallback', { status: data.status });
      return calculateFallback(origin, destination, departureTime);
    }

    const element = data.rows[0].elements[0];

    if (element.status !== 'OK') {
      logger.warn('Google Maps element status not OK', { status: element.status });
      return calculateFallback(origin, destination, departureTime);
    }

    const distanceKm = element.distance.value / 1000;
    const durationMinutes = Math.round(element.duration_in_traffic.value / 60);

    logger.debug('Google Maps ETA calculated', {
      origin: originStr,
      destination: destStr,
      distanceKm,
      durationMinutes,
    });

    return {
      distanceKm: Math.round(distanceKm * 100) / 100,
      durationMinutes: Math.max(1, durationMinutes),
      source: 'google_maps',
    };
  } catch (error) {
    logger.error('Google Maps API error, using fallback', {
      error: error.message,
      origin,
      destination,
    });
    return calculateFallback(origin, destination, departureTime);
  }
}

/**
 * Fallback calculation using haversine distance and time-based speed
 * This is used when Google Maps is disabled or fails
 */
function calculateFallback(origin, destination, departureTime) {
  const distanceKm = haversineKm(origin, destination);
  const hour = new Date(departureTime).getHours();
  const avgSpeed = getAverageSpeed(hour);
  const durationMinutes = Math.max(1, Math.round((distanceKm / avgSpeed) * 60));

  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    durationMinutes,
    source: 'haversine_fallback',
  };
}

/**
 * Get route with multiple waypoints
 * Useful for multi-stop rides
 */
async function getRouteWithWaypoints(origin, destination, waypoints = [], departureTime = new Date()) {
  if (!USE_GOOGLE_MAPS || !GOOGLE_MAPS_API_KEY || waypoints.length === 0) {
    return calculateRouteFallback(origin, destination, waypoints, departureTime);
  }

  try {
    const [originLng, originLat] = origin;
    const [destLng, destLat] = destination;

    const waypointsStr = waypoints
      .map((wp) => {
        const [lng, lat] = wp;
        return `${lat},${lng}`;
      })
      .join('|');

    const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
      params: {
        origin: `${originLat},${originLng}`,
        destination: `${destLat},${destLng}`,
        waypoints: waypointsStr,
        departure_time: Math.floor(departureTime.getTime() / 1000),
        key: GOOGLE_MAPS_API_KEY,
        mode: 'driving',
        traffic_model: 'best_guess',
      },
      timeout: 5000,
    });

    const data = response.data;

    if (data.status !== 'OK' || !data.routes || !data.routes[0]) {
      logger.warn('Google Maps Directions API returned invalid response');
      return calculateRouteFallback(origin, destination, waypoints, departureTime);
    }

    const route = data.routes[0];
    const totalDistanceKm = route.legs.reduce((sum, leg) => sum + leg.distance.value, 0) / 1000;
    const totalDurationMinutes = Math.round(
      route.legs.reduce((sum, leg) => sum + leg.duration_in_traffic.value, 0) / 60
    );

    return {
      distanceKm: Math.round(totalDistanceKm * 100) / 100,
      durationMinutes: Math.max(1, totalDurationMinutes),
      polyline: route.overview_polyline.points,
      source: 'google_maps',
    };
  } catch (error) {
    logger.error('Google Maps Directions API error', { error: error.message });
    return calculateRouteFallback(origin, destination, waypoints, departureTime);
  }
}

/**
 * Fallback for multi-stop routes
 */
function calculateRouteFallback(origin, destination, waypoints, departureTime) {
  let totalDistance = haversineKm(origin, destination);

  // Add distances for waypoints
  if (waypoints.length > 0) {
    let prevPoint = origin;
    for (const waypoint of waypoints) {
      totalDistance += haversineKm(prevPoint, waypoint);
      prevPoint = waypoint;
    }
    totalDistance += haversineKm(prevPoint, destination);
  }

  const hour = new Date(departureTime).getHours();
  const avgSpeed = getAverageSpeed(hour);
  const durationMinutes = Math.max(1, Math.round((totalDistance / avgSpeed) * 60));

  return {
    distanceKm: Math.round(totalDistance * 100) / 100,
    durationMinutes,
    polyline: null,
    source: 'haversine_fallback',
  };
}

/**
 * Optimize waypoint order using Google Directions API
 * Returns optimized coordinates in the best visiting order
 * @param {Array} origin - [longitude, latitude] starting point
 * @param {Array} waypoints - Array of [longitude, latitude] waypoints to optimize
 * @returns {Promise<{optimizedOrder: number[], optimizedCoords: Array}>}
 */
async function optimizeRoute(origin, waypoints) {
  if (!USE_GOOGLE_MAPS || !GOOGLE_MAPS_API_KEY || waypoints.length < 2) {
    return { optimizedOrder: waypoints.map((_, i) => i), optimizedCoords: waypoints };
  }

  try {
    const [originLng, originLat] = origin;
    const waypointsStr = waypoints
      .map((wp) => `${wp[1]},${wp[0]}`)
      .join('|');

    const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
      params: {
        origin: `${originLat},${originLng}`,
        destination: waypoints.length > 0
          ? `${waypoints[waypoints.length - 1][1]},${waypoints[waypoints.length - 1][0]}`
          : `${originLat},${originLng}`,
        waypoints: `optimize:true|${waypointsStr}`,
        key: GOOGLE_MAPS_API_KEY,
        mode: 'driving',
      },
      timeout: 8000,
    });

    const data = response.data;

    if (data.status !== 'OK' || !data.routes || !data.routes[0]) {
      logger.warn('Google Directions optimize API returned invalid response');
      return { optimizedOrder: waypoints.map((_, i) => i), optimizedCoords: waypoints };
    }

    const route = data.routes[0];
    const waypointOrder = route.waypoint_order || [];

    if (waypointOrder.length !== waypoints.length) {
      logger.warn('Google Directions waypoint_order length mismatch');
      return { optimizedOrder: waypoints.map((_, i) => i), optimizedCoords: waypoints };
    }

    const optimizedCoords = waypointOrder.map((idx) => {
      if (idx < 0 || idx >= waypoints.length) {
        logger.error('Invalid waypoint index in optimized order', { idx, waypointCount: waypoints.length });
        return null;
      }
      return waypoints[idx];
    });

    if (optimizedCoords.some((c) => c === null)) {
      return { optimizedOrder: waypoints.map((_, i) => i), optimizedCoords: waypoints };
    }

    return {
      optimizedOrder: waypointOrder,
      optimizedCoords,
      source: 'google_maps',
    };
  } catch (error) {
    logger.error('Google Directions optimize API error', { error: error.message });
    return { optimizedOrder: waypoints.map((_, i) => i), optimizedCoords: waypoints };
  }
}

module.exports = {
  getDistanceAndETA,
  getRouteWithWaypoints,
  calculateFallback,
  calculateRouteFallback,
  optimizeRoute,
};
