const crypto = require('crypto');
const Route = require('../models/Route');
const Subscription = require('../models/Subscription');
const Trip = require('../models/Trip');

const createStopId = () => crypto.randomUUID();

function normalizeServiceDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setHours(0, 0, 0, 0);
  return date;
}

function cloneLocation(location) {
  if (!location) return undefined;
  return {
    type: location.type || 'Point',
    coordinates: Array.isArray(location.coordinates) ? [...location.coordinates] : [],
  };
}

function buildStopSnapshot(stop) {
  if (!stop) return undefined;
  return {
    stopId: stop.stopId,
    stopName: stop.stopName,
    sequenceOrder: stop.sequenceOrder,
    location: cloneLocation(stop.location),
  };
}

function normalizeRouteStops(stops, makeStopId = createStopId) {
  const usedStopIds = new Set();
  let changed = false;
  const normalizedStops = (stops || []).map((sourceStop) => {
    const stop = typeof sourceStop.toObject === 'function'
      ? sourceStop.toObject()
      : { ...sourceStop };
    if (!stop.stopId || usedStopIds.has(stop.stopId)) {
      stop.stopId = makeStopId();
      changed = true;
    }
    usedStopIds.add(stop.stopId);
    return stop;
  });
  return { stops: normalizedStops, changed };
}

function findStopByReference(stops, stopId, legacyIndex, fallbackIndex) {
  const managedStops = stops || [];
  if (stopId) {
    const stableStop = managedStops.find((stop) => stop.stopId === stopId);
    if (stableStop) return stableStop;
  }
  if (Number.isInteger(legacyIndex) && managedStops[legacyIndex]) {
    return managedStops[legacyIndex];
  }
  return Number.isInteger(fallbackIndex) ? managedStops[fallbackIndex] : undefined;
}

function resolveSubscriptionStops(route, subscription) {
  const stops = route?.stops || [];
  return {
    pickupStop: findStopByReference(stops, subscription?.pickupStopId, subscription?.pickupStopIndex, 0),
    dropStop: findStopByReference(stops, subscription?.dropStopId, subscription?.dropStopIndex, stops.length - 1),
  };
}

function deriveSubscriptionStopSelection(subscription, route) {
  const { pickupStop, dropStop } = resolveSubscriptionStops(route, subscription);
  const updates = {};
  if (pickupStop && !subscription.pickupStopId) {
    updates.pickupStopId = pickupStop.stopId;
    updates.pickupStopSequence = pickupStop.sequenceOrder;
  } else if (pickupStop && subscription.pickupStopSequence == null) {
    updates.pickupStopSequence = pickupStop.sequenceOrder;
  }
  if (dropStop && !subscription.dropStopId) {
    updates.dropStopId = dropStop.stopId;
    updates.dropStopSequence = dropStop.sequenceOrder;
  } else if (dropStop && subscription.dropStopSequence == null) {
    updates.dropStopSequence = dropStop.sequenceOrder;
  }
  return updates;
}

function findSnapshotStop(route, snapshot) {
  if (!snapshot) return undefined;
  const stops = route?.stops || [];
  return findStopByReference(
    stops,
    snapshot.stopId,
    undefined,
    undefined
  ) || stops.find((stop) => (
    stop.sequenceOrder === snapshot.sequenceOrder && stop.stopName === snapshot.stopName
  ));
}

function backfillTripDocument(trip, route) {
  let changed = false;
  if (!trip.serviceDate) {
    const serviceDate = normalizeServiceDate(trip.tripDate);
    if (serviceDate) {
      trip.serviceDate = serviceDate;
      changed = true;
    }
  }

  for (const entry of trip.manifest || []) {
    for (const key of ['pickupStop', 'dropStop']) {
      const snapshot = entry[key];
      if (!snapshot || snapshot.stopId) continue;
      const routeStop = findSnapshotStop(route, snapshot);
      if (routeStop) {
        entry[key] = { ...buildStopSnapshot(routeStop), ...snapshot, stopId: routeStop.stopId };
        changed = true;
      } else if (!entry.conflict || entry.conflict.state === 'NONE') {
        entry.conflict = {
          state: 'REQUIRES_RESOLUTION',
          reason: `Unable to backfill ${key} durable ID from the current route.`,
          detectedAt: new Date(),
        };
        changed = true;
      }
    }
  }
  return changed;
}

async function backfillDurableStopData({
  RouteModel = Route,
  SubscriptionModel = Subscription,
  TripModel = Trip,
  dryRun = false,
  logger = console,
} = {}) {
  const summary = {
    routesUpdated: 0,
    subscriptionsUpdated: 0,
    tripsUpdated: 0,
    manifestConflicts: 0,
  };
  const routesById = new Map();

  for await (const route of RouteModel.find({}).cursor()) {
    const { stops, changed } = normalizeRouteStops(route.stops);
    if (changed) {
      route.stops = stops;
      if (!dryRun) await route.save();
      summary.routesUpdated += 1;
    }
    routesById.set(String(route._id), { ...route.toObject(), stops });
  }

  for await (const subscription of SubscriptionModel.find({}).cursor()) {
    const route = routesById.get(String(subscription.routeId));
    if (!route) continue;
    const updates = deriveSubscriptionStopSelection(subscription, route);
    if (Object.keys(updates).length === 0) continue;
    Object.assign(subscription, updates);
    if (!dryRun) await subscription.save();
    summary.subscriptionsUpdated += 1;
  }

  for await (const trip of TripModel.find({}).cursor()) {
    const route = routesById.get(String(trip.routeId));
    const previousConflictCount = (trip.manifest || []).filter(
      (entry) => entry.conflict?.state === 'REQUIRES_RESOLUTION'
    ).length;
    if (!backfillTripDocument(trip, route)) continue;
    const currentConflictCount = (trip.manifest || []).filter(
      (entry) => entry.conflict?.state === 'REQUIRES_RESOLUTION'
    ).length;
    summary.manifestConflicts += Math.max(0, currentConflictCount - previousConflictCount);
    if (!dryRun) {
      trip.markModified('manifest');
      await trip.save();
    }
    summary.tripsUpdated += 1;
  }

  logger.info?.('[DurableStopMigration] completed', summary);
  return summary;
}

module.exports = {
  backfillDurableStopData,
  backfillTripDocument,
  buildStopSnapshot,
  deriveSubscriptionStopSelection,
  findStopByReference,
  normalizeRouteStops,
  normalizeServiceDate,
  resolveSubscriptionStops,
};
