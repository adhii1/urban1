const Driver = require('../models/Driver');
const OperationalException = require('../models/OperationalException');
const Route = require('../models/Route');
const Subscription = require('../models/Subscription');
const Trip = require('../models/Trip');
const { normalizeServiceDate } = require('./tripGenerator');
const { NotFoundError, ValidationError } = require('../utils/AppError');

const TERMINAL_TRIP_STATUSES = ['COMPLETED', 'CANCELLED'];
const ROUTE_CONFLICT_TYPE = 'ROUTE_CHANGE_CONFLICT';

const RECONCILIATION_CODES = Object.freeze({
  INVALID_REPLACEMENT_STOPS: 'INVALID_REPLACEMENT_STOPS',
  INACTIVE_REPLACEMENT_ROUTE: 'INACTIVE_REPLACEMENT_ROUTE',
  INACTIVE_DRIVER: 'INACTIVE_DRIVER',
  INVALID_EXCEPTION: 'INVALID_EXCEPTION',
});

function asId(value) {
  return value == null ? null : String(value);
}

function sameId(left, right) {
  return asId(left) === asId(right);
}

function futureTripFilter(routeId, effectiveDate) {
  return {
    routeId,
    isDeleted: false,
    serviceDate: { $gte: normalizeServiceDate(effectiveDate || new Date()) },
    status: { $nin: TERMINAL_TRIP_STATUSES },
  };
}

function snapshotStop(stop) {
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

function getManifestConflict(entry, route) {
  if (route.isDeleted || route.status !== 'ACTIVE') {
    return 'The route is no longer active for this scheduled service.';
  }

  const pickupStopId = entry.pickupStop?.stopId;
  const dropStopId = entry.dropStop?.stopId;
  const pickupStop = route.stops?.find((stop) => stop.stopId === pickupStopId);
  const dropStop = route.stops?.find((stop) => stop.stopId === dropStopId);

  if (!pickupStop || !dropStop) {
    return !pickupStop && !dropStop
      ? 'Both selected route stops were removed.'
      : `The selected ${!pickupStop ? 'pickup' : 'drop'} route stop was removed.`;
  }

  if (pickupStop.sequenceOrder >= dropStop.sequenceOrder) {
    return 'The selected route stops are no longer in forward travel order.';
  }

  if (
    entry.pickupStop?.sequenceOrder !== pickupStop.sequenceOrder
    || entry.dropStop?.sequenceOrder !== dropStop.sequenceOrder
  ) {
    return 'The selected route stop sequence changed and requires confirmation.';
  }

  return null;
}

async function recordConflict({ routeId, trip, entry, reason }) {
  const serviceDate = trip.serviceDate || trip.tripDate;
  return OperationalException.findOneAndUpdate(
    {
      type: ROUTE_CONFLICT_TYPE,
      routeId,
      tripId: trip._id,
      subscriptionId: entry.subscriptionId,
      serviceDate,
      status: 'OPEN',
    },
    {
      $set: { reason },
      $setOnInsert: {
        type: ROUTE_CONFLICT_TYPE,
        routeId,
        tripId: trip._id,
        subscriptionId: entry.subscriptionId,
        serviceDate,
        reason,
        status: 'OPEN',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

/**
 * Copies an active route driver to future, non-terminal scheduled-service trips.
 */
async function applyDriverChange(routeId, driverId, effectiveDate = new Date()) {
  let driver = null;
  if (driverId) {
    driver = await Driver.findOne({ _id: driverId, status: 'ACTIVE' }).lean();
    if (!driver) {
      const error = new ValidationError('The assigned route driver must be active.');
      error.code = RECONCILIATION_CODES.INACTIVE_DRIVER;
      throw error;
    }
  }

  const result = await Trip.updateMany(
    futureTripFilter(routeId, effectiveDate),
    { $set: { driverId: driver?._id || null } },
    { runValidators: true }
  );

  return {
    routeId,
    driverId: driver?._id || null,
    effectiveDate: normalizeServiceDate(effectiveDate),
    updatedTrips: result.modifiedCount,
    matchedTrips: result.matchedCount,
  };
}

/**
 * Marks future manifests that no longer represent a safe route selection. The
 * caller passes the post-mutation route document so deleted routes can also be
 * reconciled without querying through Route's soft-delete filter.
 */
async function reconcileStopChange(routeId, { route: suppliedRoute } = {}, effectiveDate = new Date()) {
  const route = suppliedRoute || await Route.findById(routeId).lean();
  if (!route) throw new NotFoundError('Route');

  const trips = await Trip.find(futureTripFilter(routeId, effectiveDate));
  const exceptions = [];
  let affectedManifestEntries = 0;

  for (const trip of trips) {
    let changed = false;
    for (const entry of trip.manifest || []) {
      if (!entry.subscriptionId) continue;
      const reason = getManifestConflict(entry, route);
      if (!reason) continue;

      if (entry.conflict?.state !== 'REQUIRES_RESOLUTION' || entry.conflict.reason !== reason) {
        entry.conflict = {
          state: 'REQUIRES_RESOLUTION',
          reason,
          detectedAt: new Date(),
        };
        changed = true;
      }
      affectedManifestEntries += 1;
      exceptions.push(await recordConflict({ routeId, trip, entry, reason }));
    }
    if (changed) {
      trip.markModified('manifest');
      await trip.save();
    }
  }

  return {
    routeId,
    effectiveDate: normalizeServiceDate(effectiveDate),
    affectedManifestEntries,
    exceptions,
  };
}

function validateReplacementStops(route, pickupStopId, dropStopId) {
  if (route.isDeleted || route.status !== 'ACTIVE') {
    const error = new ValidationError('Replacement stops require an active route.');
    error.code = RECONCILIATION_CODES.INACTIVE_REPLACEMENT_ROUTE;
    throw error;
  }

  const pickupStop = route.stops?.find((stop) => stop.stopId === pickupStopId);
  const dropStop = route.stops?.find((stop) => stop.stopId === dropStopId);
  if (!pickupStop || !dropStop || pickupStopId === dropStopId || pickupStop.sequenceOrder >= dropStop.sequenceOrder) {
    const error = new ValidationError('Replacement stops must be distinct route stops in forward travel order.');
    error.code = RECONCILIATION_CODES.INVALID_REPLACEMENT_STOPS;
    throw error;
  }
  return { pickupStop, dropStop };
}

/**
 * Resolves a route-change exception by applying validated durable stop IDs to
 * the subscription and all of its future non-terminal route manifests.
 */
async function resolveManifestConflict({
  exceptionId,
  subscriptionId,
  pickupStopId,
  dropStopId,
  effectiveDate = new Date(),
  resolvedBy,
  notes,
}) {
  let exception = null;
  if (exceptionId) {
    exception = await OperationalException.findById(exceptionId);
    if (!exception) throw new NotFoundError('Operational exception');
    if (exception.type !== ROUTE_CONFLICT_TYPE || exception.status !== 'OPEN') {
      const error = new ValidationError('Only open route-change conflicts can be resolved.');
      error.code = RECONCILIATION_CODES.INVALID_EXCEPTION;
      throw error;
    }
    subscriptionId = exception.subscriptionId;
  }

  const subscription = await Subscription.findById(subscriptionId);
  if (!subscription) throw new NotFoundError('Subscription');
  const route = await Route.findById(subscription.routeId).lean();
  if (!route) throw new NotFoundError('Route');

  const { pickupStop, dropStop } = validateReplacementStops(route, pickupStopId, dropStopId);
  const fromDate = normalizeServiceDate(effectiveDate);
  subscription.pickupStopId = pickupStop.stopId;
  subscription.dropStopId = dropStop.stopId;
  subscription.pickupStopSequence = pickupStop.sequenceOrder;
  subscription.dropStopSequence = dropStop.sequenceOrder;
  await subscription.save();

  const trips = await Trip.find({
    ...futureTripFilter(route._id, fromDate),
    'manifest.subscriptionId': subscription._id,
  });
  let updatedManifestEntries = 0;
  for (const trip of trips) {
    let changed = false;
    for (const entry of trip.manifest || []) {
      if (!sameId(entry.subscriptionId, subscription._id)) continue;
      entry.pickupStop = snapshotStop(pickupStop);
      entry.dropStop = snapshotStop(dropStop);
      entry.conflict = { state: 'NONE' };
      changed = true;
      updatedManifestEntries += 1;
    }
    if (changed) {
      trip.markModified('manifest');
      await trip.save();
    }
  }

  const resolution = {
    resolvedAt: new Date(),
    resolvedBy: resolvedBy || undefined,
    notes: notes || undefined,
    pickupStopId: pickupStop.stopId,
    dropStopId: dropStop.stopId,
  };
  const exceptionFilter = {
    type: ROUTE_CONFLICT_TYPE,
    routeId: route._id,
    subscriptionId: subscription._id,
    serviceDate: { $gte: fromDate },
    status: 'OPEN',
  };
  await OperationalException.updateMany(exceptionFilter, {
    $set: { status: 'RESOLVED', resolution },
  });

  return {
    subscription,
    updatedManifestEntries,
    pickupStop: snapshotStop(pickupStop),
    dropStop: snapshotStop(dropStop),
    resolvedExceptionId: exception?._id || null,
  };
}

module.exports = {
  RECONCILIATION_CODES,
  applyDriverChange,
  getManifestConflict,
  reconcileStopChange,
  resolveManifestConflict,
};
