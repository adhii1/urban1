const Customer = require('../models/Customer');
const Route = require('../models/Route');

const normalize = (value) =>
  (value || '')
    .toLowerCase()
    .replace(/[,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toRad = (deg) => (deg * Math.PI) / 180;

// Coordinates are GeoJSON style [lng, lat]
const haversineKm = (a, b) => {
  const earthRadiusKm = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
};

// Average Bangalore city driving speed in km/h (accounts for traffic)
// Time-based speed adjustment for more accurate ETAs
const getAverageSpeed = (hour = 12) => {
  // Peak hours: 8-10 AM and 6-9 PM (slower traffic)
  // Off-peak: 11 PM - 6 AM (faster traffic)
  // Regular: rest of the day
  if ((hour >= 8 && hour < 10) || (hour >= 18 && hour < 21)) {
    return 15; // Peak hour speed
  } else if (hour >= 23 || hour < 6) {
    return 30; // Night speed (less traffic)
  }
  return 20; // Regular speed
};

function estimateEtaMinutes(fromCoords, toCoords, timestamp = new Date()) {
  const distanceKm = haversineKm(fromCoords, toCoords);
  const hour = new Date(timestamp).getHours();
  const avgSpeed = getAverageSpeed(hour);
  const minutes = Math.round((distanceKm / avgSpeed) * 60);
  return Math.max(1, minutes);
}

// Calculate trip duration estimate (pickup to drop)
function estimateTripDuration(pickupCoords, dropCoords, timestamp = new Date()) {
  const distanceKm = haversineKm(pickupCoords, dropCoords);
  const hour = new Date(timestamp).getHours();
  const avgSpeed = getAverageSpeed(hour);
  const minutes = Math.round((distanceKm / avgSpeed) * 60);
  return {
    durationMinutes: Math.max(1, minutes),
    distanceKm: Math.round(distanceKm * 100) / 100,
  };
}

const isValidCoordinates = (coords) => Array.isArray(coords) && coords.length === 2;

// Match a customer's saved location (address + coordinates) to the best route stop.
// 1) Normalized name match, 2) partial name match, 3) nearest stop by distance.
const matchLocationToStop = (location, stops) => {
  if (!location || !Array.isArray(stops) || stops.length === 0) return null;

  const target = normalize(location.address);
  if (target) {
    const exact = stops.find((s) => normalize(s.stopName) === target);
    if (exact) return exact;
    const partial = stops.find((s) => {
      const name = normalize(s.stopName);
      return name.includes(target) || target.includes(name);
    });
    if (partial) return partial;
  }

  if (isValidCoordinates(location.coordinates)) {
    let best = null;
    let bestDistance = Infinity;
    for (const stop of stops) {
      const coords = stop.location && stop.location.coordinates;
      if (!isValidCoordinates(coords)) continue;
      const distance = haversineKm(location.coordinates, coords);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = stop;
      }
    }
    return best;
  }

  return null;
};

const toStopSnapshot = (stop) => {
  if (!stop) return null;
  return {
    stopName: stop.stopName,
    sequenceOrder: stop.sequenceOrder,
    location: stop.location,
  };
};

// Build the boarding manifest for a trip from customer ids against a route's stops.
const buildTripManifest = async (customerIds, routeId) => {
  if (!Array.isArray(customerIds) || customerIds.length === 0) return [];
  const route = await Route.findById(routeId);
  const stops = (route && route.stops) || [];
  const customers = await Customer.find({ _id: { $in: customerIds } });

  return customers.map((customer) => ({
    customer: customer._id,
    pickupStop: toStopSnapshot(matchLocationToStop(customer.pickupLocation, stops)),
    dropStop: toStopSnapshot(matchLocationToStop(customer.dropLocation, stops)),
    status: 'PENDING',
  }));
};

module.exports = {
  haversineKm,
  estimateEtaMinutes,
  estimateTripDuration,
  getAverageSpeed,
  matchLocationToStop,
  toStopSnapshot,
  buildTripManifest,
};
