const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

const Route = require('../models/Route');
const Subscription = require('../models/Subscription');
const Trip = require('../models/Trip');
const OperationalException = require('../models/OperationalException');
const {
  backfillTripDocument,
  deriveSubscriptionStopSelection,
  normalizeRouteStops,
  resolveSubscriptionStops,
} = require('../services/durableStopMigrationService');

const routeStops = [
  {
    stopId: 'alpha',
    stopName: 'Alpha',
    sequenceOrder: 10,
    location: { type: 'Point', coordinates: [77.6, 12.9] },
  },
  {
    stopId: 'omega',
    stopName: 'Omega',
    sequenceOrder: 20,
    location: { type: 'Point', coordinates: [77.7, 12.8] },
  },
];

test('Route assigns stable IDs and rejects duplicate stop sequence orders', async () => {
  const route = new Route({
    name: 'Stable route',
    startLocation: 'Start',
    endLocation: 'End',
    stops: [
      { stopName: 'One', sequenceOrder: 1, location: { coordinates: [77, 12] } },
      { stopName: 'Two', sequenceOrder: 2, location: { coordinates: [78, 13] } },
    ],
  });
  await route.validate();
  assert.ok(route.stops.every((stop) => typeof stop.stopId === 'string' && stop.stopId.length > 0));
  assert.notEqual(route.stops[0].stopId, route.stops[1].stopId);

  route.stops[1].sequenceOrder = 1;
  await assert.rejects(route.validate(), /unique sequenceOrder/);
});

test('durable selection resolves IDs first and backfills legacy stop indexes idempotently', () => {
  const route = { stops: routeStops };
  const legacySubscription = { pickupStopIndex: 0, dropStopIndex: 1 };
  const selection = deriveSubscriptionStopSelection(legacySubscription, route);
  assert.deepEqual(selection, {
    pickupStopId: 'alpha',
    pickupStopSequence: 10,
    dropStopId: 'omega',
    dropStopSequence: 20,
  });

  const resolved = resolveSubscriptionStops(route, {
    pickupStopId: 'omega',
    pickupStopIndex: 0,
    dropStopId: 'alpha',
    dropStopIndex: 1,
  });
  assert.equal(resolved.pickupStop.stopId, 'omega');
  assert.equal(resolved.dropStop.stopId, 'alpha');
  assert.deepEqual(deriveSubscriptionStopSelection({ ...legacySubscription, ...selection }, route), {});
});

test('route-stop normalization assigns missing IDs once and preserves them on repeat', () => {
  let calls = 0;
  const makeStopId = () => `generated-${++calls}`;
  const first = normalizeRouteStops([
    { stopName: 'One', sequenceOrder: 1 },
    { stopName: 'Two', sequenceOrder: 2 },
  ], makeStopId);
  const second = normalizeRouteStops(first.stops, makeStopId);
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(calls, 2);
  assert.deepEqual(second.stops.map((stop) => stop.stopId), ['generated-1', 'generated-2']);
});

test('Trip normalizes service dates, persists conflict state, and indexes active route dates uniquely', async () => {
  const trip = new Trip({
    routeId: new mongoose.Types.ObjectId(),
    tripDate: new Date('2025-06-16T16:30:00.000Z'),
    manifest: [{
      customer: new mongoose.Types.ObjectId(),
      subscriptionId: new mongoose.Types.ObjectId(),
      pickupStop: { stopId: 'alpha', stopName: 'Alpha', sequenceOrder: 10 },
      dropStop: { stopId: 'omega', stopName: 'Omega', sequenceOrder: 20 },
    }],
  });
  await trip.validate();
  assert.equal(trip.serviceDate.getHours(), 0);
  assert.equal(trip.manifest[0].conflict.state, 'NONE');

  const routeDateIndex = Trip.schema.indexes().find(([keys]) => (
    keys.routeId === 1 && keys.serviceDate === 1
  ));
  assert.equal(routeDateIndex[1].unique, true);
  // `routeId: { $type: 'objectId' }` is load-bearing, not decoration: area-based
  // trips carry no routeId, so without it they all index at routeId: null and two
  // drivers working the same date collide with E11000.
  assert.deepEqual(routeDateIndex[1].partialFilterExpression, {
    isDeleted: false,
    routeId: { $type: 'objectId' },
    serviceDate: { $exists: true },
  });
});

test('trip backfill attaches durable snapshot IDs and flags unknown legacy snapshots', () => {
  const trip = {
    tripDate: new Date('2025-06-17T12:00:00.000Z'),
    manifest: [{
      pickupStop: { stopName: 'Alpha', sequenceOrder: 10 },
      dropStop: { stopName: 'Unknown', sequenceOrder: 30 },
    }],
  };
  assert.equal(backfillTripDocument(trip, { stops: routeStops }), true);
  assert.equal(trip.serviceDate.getHours(), 0);
  assert.equal(trip.manifest[0].pickupStop.stopId, 'alpha');
  assert.equal(trip.manifest[0].conflict.state, 'REQUIRES_RESOLUTION');
});

test('OperationalException persists service context and resolution metadata', async () => {
  const exception = new OperationalException({
    type: 'ROUTE_CHANGE_CONFLICT',
    routeId: new mongoose.Types.ObjectId(),
    tripId: new mongoose.Types.ObjectId(),
    subscriptionId: new mongoose.Types.ObjectId(),
    serviceDate: new Date('2025-06-18T00:00:00.000Z'),
    reason: 'Pickup stop was removed.',
    resolution: { pickupStopId: 'replacement-pickup', dropStopId: 'replacement-drop' },
  });
  await exception.validate();
  assert.equal(exception.status, 'OPEN');
  assert.equal(exception.resolution.pickupStopId, 'replacement-pickup');
  assert.equal(Subscription.schema.path('pickupStopId').instance, 'String');
  assert.equal(Subscription.schema.path('dropStopSequence').instance, 'Number');
});
