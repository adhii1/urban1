const Subscription = require('../models/Subscription');
const Route = require('../models/Route');
const Driver = require('../models/Driver');
const Trip = require('../models/Trip');
const OperationalException = require('../models/OperationalException');
const { isActiveRoute, isEligibleOnServiceDate } = require('./subscriptionPolicyService');
const logger = require('../utils/logger');

const GENERATION_CODES = Object.freeze({
  INVALID_SERVICE_DATE: 'INVALID_SERVICE_DATE',
  INVALID_ROUTE_FILTER: 'INVALID_ROUTE_FILTER',
});

function normalizeServiceDate(value) {
  let date;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    date = new Date(year, month - 1, day);
  } else {
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) {
    const error = new Error('A valid service date is required.');
    error.code = GENERATION_CODES.INVALID_SERVICE_DATE;
    throw error;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

function getServiceDayWindow(serviceDate) {
  const start = normalizeServiceDate(serviceDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return { start, end };
}

function snapshotStop(stop) {
  if (!stop?.stopId) return null;
  return {
    stopId: stop.stopId,
    stopName: stop.stopName,
    sequenceOrder: stop.sequenceOrder,
    location: stop.location ? {
      type: stop.location.type || 'Point',
      coordinates: [...(stop.location.coordinates || [])],
    } : undefined,
  };
}

function buildManifestEntry(subscription, route) {
  const pickupStop = route.stops?.find((stop) => stop.stopId === subscription.pickupStopId)
    || route.stops?.[subscription.pickupStopIndex];
  const dropStop = route.stops?.find((stop) => stop.stopId === subscription.dropStopId)
    || route.stops?.[subscription.dropStopIndex];
  const pickupSnapshot = snapshotStop(pickupStop);
  const dropSnapshot = snapshotStop(dropStop);

  if (!pickupSnapshot || !dropSnapshot) {
    throw new Error('The subscription references a route stop that is no longer available.');
  }

  return {
    customer: subscription.customerId?._id || subscription.customerId,
    subscriptionId: subscription._id,
    pickupStop: pickupSnapshot,
    dropStop: dropSnapshot,
    status: 'PENDING',
    conflict: { state: 'NONE' },
  };
}

async function recordException({ type, routeId, tripId, subscriptionId, serviceDate, reason }) {
  const filter = {
    type,
    routeId: routeId || null,
    tripId: tripId || null,
    subscriptionId: subscriptionId || null,
    serviceDate,
    status: 'OPEN',
  };
  const exception = await OperationalException.findOneAndUpdate(
    filter,
    { $setOnInsert: { ...filter, reason } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return exception;
}

async function loadEligibleSubscriptions(serviceDate, routeIds) {
  const { start, end } = getServiceDayWindow(serviceDate);
  const query = {
    status: 'ACTIVE',
    startDate: { $lte: end },
    endDate: { $gte: start },
  };
  if (routeIds?.length) query.routeId = { $in: routeIds };

  const subscriptions = await Subscription.find(query)
    .populate('planId')
    .populate('routeId')
    .populate('customerId')
    .lean();

  return subscriptions.filter((subscription) => (
    isActiveRoute(subscription.routeId)
    && isEligibleOnServiceDate({
      subscription,
      plan: subscription.planId,
      serviceDate: start,
    })
  ));
}

async function persistDriverAssignment(trip, driver) {
  const nextDriverId = driver?._id || null;
  const currentDriverId = trip.driverId?.toString() || null;
  if (currentDriverId === (nextDriverId?.toString() || null)) return;

  trip.driverId = nextDriverId;
  await trip.save();
}

async function findOrCreateTrip({ route, serviceDate, driver }) {
  let trip = await Trip.findOne({ routeId: route._id, serviceDate });
  if (trip) {
    if (trip.status !== 'SCHEDULED') return { trip, created: false, skipped: true };
    await persistDriverAssignment(trip, driver);
    return { trip, created: false, skipped: false };
  }

  try {
    // Persist the route/date identity before the configured driver assignment.
    // If that assignment cannot be persisted, delete this newly created trip so
    // a failed configured-driver assignment never leaves an unassigned trip.
    trip = await Trip.create({
      routeId: route._id,
      driverId: null,
      serviceDate,
      tripDate: serviceDate,
      status: 'SCHEDULED',
      manifest: [],
    });

    try {
      await persistDriverAssignment(trip, driver);
    } catch (error) {
      try {
        await Trip.deleteOne({ _id: trip._id });
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
      throw error;
    }

    return { trip, created: true, skipped: false };
  } catch (error) {
    // Concurrent recovery jobs can race the first route/date insert. The
    // unique route/service-date index remains the authority in that case.
    if (error?.code === 11000) {
      trip = await Trip.findOne({ routeId: route._id, serviceDate });
      if (trip) return { trip, created: false, skipped: trip.status !== 'SCHEDULED' };
    }
    throw error;
  }
}

async function upsertManifestEntry(trip, entry) {
  const addedTrip = await Trip.findOneAndUpdate(
    { _id: trip._id, 'manifest.subscriptionId': { $ne: entry.subscriptionId } },
    { $push: { manifest: entry } },
    { new: true, runValidators: true }
  );
  return Boolean(addedTrip);
}

/**
 * Generate scheduled trips for one local service date. Each eligible active
 * route receives one route/date trip and each eligible subscription receives
 * one uniquely keyed manifest entry.
 */
async function generateForServiceDate(serviceDate, { routeIds } = {}) {
  const normalizedDate = normalizeServiceDate(serviceDate);
  if (routeIds !== undefined && (!Array.isArray(routeIds) || routeIds.length > 100)) {
    const error = new Error('routeIds must be an array of no more than 100 route identifiers.');
    error.code = GENERATION_CODES.INVALID_ROUTE_FILTER;
    throw error;
  }

  const routeFilter = routeIds?.map(String);
  const subscriptions = await loadEligibleSubscriptions(normalizedDate, routeFilter);
  const groups = new Map();
  for (const subscription of subscriptions) {
    const route = subscription.routeId;
    const routeId = route?._id?.toString();
    if (!routeId) continue;
    const group = groups.get(routeId) || { route, subscriptions: [] };
    group.subscriptions.push(subscription);
    groups.set(routeId, group);
  }

  const summary = {
    serviceDate: normalizedDate,
    createdTrips: 0,
    updatedTrips: 0,
    manifestEntries: 0,
    exceptions: [],
  };

  for (const { route, subscriptions: routeSubscriptions } of groups.values()) {
    const activeDriver = route.assignedDriver
      ? await Driver.findOne({ _id: route.assignedDriver, status: 'ACTIVE' }).lean()
      : null;
    let trip;
    let created = false;

    try {
      const result = await findOrCreateTrip({ route, serviceDate: normalizedDate, driver: activeDriver });
      trip = result.trip;
      created = result.created;
      if (result.skipped) continue;
      if (created) summary.createdTrips += 1;
      else summary.updatedTrips += 1;
    } catch (error) {
      const assignmentFailure = Boolean(activeDriver);
      const exception = await recordException({
        type: assignmentFailure ? 'DRIVER_ASSIGNMENT_FAILED' : 'TRIP_GENERATION_FAILED',
        routeId: route._id,
        serviceDate: normalizedDate,
        reason: assignmentFailure
          ? `Configured driver assignment failed: ${error.message}`
          : `Trip generation failed: ${error.message}`,
      });
      summary.exceptions.push(exception);
      logger.error('[TripGenerator] Route/date creation failed', {
        routeId: route._id,
        serviceDate: normalizedDate,
        assignmentFailure,
        error: error.message,
      });
      continue;
    }

    if (!activeDriver) {
      const exception = await recordException({
        type: 'UNASSIGNED_DRIVER',
        routeId: route._id,
        tripId: trip._id,
        serviceDate: normalizedDate,
        reason: 'The route has no active assigned driver.',
      });
      summary.exceptions.push(exception);
    }

    for (const subscription of routeSubscriptions) {
      try {
        const entry = buildManifestEntry(subscription, route);
        if (await upsertManifestEntry(trip, entry)) summary.manifestEntries += 1;
      } catch (error) {
        const exception = await recordException({
          type: 'TRIP_GENERATION_FAILED',
          routeId: route._id,
          tripId: trip._id,
          subscriptionId: subscription._id,
          serviceDate: normalizedDate,
          reason: error.message,
        });
        summary.exceptions.push(exception);
        logger.error('[TripGenerator] Manifest generation failed', {
          routeId: route._id,
          tripId: trip._id,
          subscriptionId: subscription._id,
          error: error.message,
        });
      }
    }
  }

  return summary;
}

/** Rebuild scheduled service from a chosen day onward for one subscription. */
async function reconcileSubscription(subscriptionId, fromServiceDate) {
  const subscription = await Subscription.findById(subscriptionId).lean();
  if (!subscription) return { createdTrips: 0, updatedTrips: 0, manifestEntries: 0, exceptions: [] };
  return generateForServiceDate(fromServiceDate, { routeIds: [subscription.routeId.toString()] });
}

module.exports = {
  GENERATION_CODES,
  getServiceDayWindow,
  normalizeServiceDate,
  generateForServiceDate,
  reconcileSubscription,
};
