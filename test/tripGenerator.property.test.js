const assert = require('node:assert/strict');
const test = require('node:test');
const fc = require('fast-check');
const mongoose = require('mongoose');
const db = require('./helpers/db');
const Route = require('../models/Route');
const Plan = require('../models/Plan');
const Customer = require('../models/Customer');
const Driver = require('../models/Driver');
const Subscription = require('../models/Subscription');
const Trip = require('../models/Trip');
const OperationalException = require('../models/OperationalException');
const { generateForServiceDate } = require('../services/tripGenerator');

const objectId = () => new mongoose.Types.ObjectId();
const serviceDate = (offset) => new Date(2025, 0, 1 + offset);

function standardPlan() {
  return {
    name: 'Property Stop-to-Stop', serviceType: 'Stop-to-Stop', tier: 'Standard',
    durationDays: 365, price: 1,
    bookingRules: { isSharedRide: true, useManagedStops: true },
  };
}

function routeInput(index, driverId) {
  return {
    name: `Route ${index}`, startLocation: 'Start', endLocation: 'End', assignedDriver: driverId,
    stops: [
      { stopId: `pickup-${index}`, stopName: `Pickup ${index}`, sequenceOrder: 10, location: { type: 'Point', coordinates: [77.5 + index, 12.5] } },
      { stopId: `drop-${index}`, stopName: `Drop ${index}`, sequenceOrder: 20, location: { type: 'Point', coordinates: [77.6 + index, 12.6] } },
    ],
  };
}

async function createDriver(index) {
  return Driver.create({
    userId: objectId(), name: `Driver ${index}`, vehicleNumber: `KA01AB${1000 + index}`,
    vehicleModel: 'Van', vehicleCapacity: 6, licenseNumber: `LIC-${index}`, status: 'ACTIVE',
  });
}

async function createFixture({ routeCounts, activeDrivers = [] }) {
  const plan = await Plan.create(standardPlan());
  const routes = [];
  const subscriptionsByRoute = new Map();
  for (const [index, count] of routeCounts.entries()) {
    const driver = activeDrivers[index] ? await createDriver(index) : null;
    const route = await Route.create(routeInput(index, driver?._id));
    routes.push({ route, driver });
    const subscriptions = [];
    for (let passenger = 0; passenger < count; passenger += 1) {
      const customer = await Customer.create({ userId: objectId(), name: `Passenger ${index}-${passenger}` });
      subscriptions.push(await Subscription.create({
        customerId: customer._id, planId: plan._id, routeId: route._id,
        startDate: new Date(2024, 0, 1), endDate: new Date(2026, 11, 31), status: 'ACTIVE',
        pickupStopId: route.stops[0].stopId, dropStopId: route.stops[1].stopId,
        pickupStopSequence: route.stops[0].sequenceOrder, dropStopSequence: route.stops[1].sequenceOrder,
      }));
    }
    subscriptionsByRoute.set(route._id.toString(), subscriptions);
  }
  return { routes, subscriptionsByRoute };
}

function normalizeTrips(trips) {
  return trips.map((trip) => ({
    id: trip._id.toString(), routeId: trip.routeId.toString(), serviceDate: trip.serviceDate.toISOString(),
    driverId: trip.driverId?.toString() || null,
    manifest: trip.manifest.map((entry) => ({
      subscriptionId: entry.subscriptionId.toString(), customer: entry.customer.toString(), status: entry.status,
      pickupStop: entry.pickupStop, dropStop: entry.dropStop,
    })).sort((left, right) => left.subscriptionId.localeCompare(right.subscriptionId)),
  })).sort((left, right) => left.routeId.localeCompare(right.routeId));
}

test.before(async () => { await db.connect(); });
test.beforeEach(async () => {
  // Clear documents, keep indexes — see test/helpers/db.js.
  await db.resetData();
});
test.after(async () => { await db.disconnect(); });

// Feature: torqq-four-model-handover, Property 7: Idempotent route-date manifest generation
// **Validates: Requirements 4.1, 4.2, 4.3, 5.4, 9.5**
test('Property 7: route-date generation groups complete PENDING manifests and preserves rerun identity', async () => {
  await fc.assert(fc.asyncProperty(
    fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 3 }),
    fc.integer({ min: 0, max: 364 }),
    async (routeCounts, dateOffset) => {
      const fixture = await createFixture({ routeCounts });
      const date = serviceDate(dateOffset);
      const first = await generateForServiceDate(date);
      assert.equal(first.createdTrips, routeCounts.length);
      assert.equal(first.manifestEntries, routeCounts.reduce((sum, count) => sum + count, 0));

      const persisted = await Trip.find({}).lean();
      assert.equal(persisted.length, routeCounts.length);
      for (const { route } of fixture.routes) {
        const trip = persisted.find((candidate) => candidate.routeId.toString() === route._id.toString());
        const subscriptions = fixture.subscriptionsByRoute.get(route._id.toString());
        assert.ok(trip);
        assert.equal(trip.status, 'SCHEDULED');
        assert.equal(trip.manifest.length, subscriptions.length);
        for (const entry of trip.manifest) {
          const subscription = subscriptions.find((candidate) => candidate._id.toString() === entry.subscriptionId.toString());
          assert.ok(subscription);
          assert.equal(entry.status, 'PENDING');
          assert.equal(entry.customer.toString(), subscription.customerId.toString());
          assert.deepEqual(entry.pickupStop.toObject ? entry.pickupStop.toObject() : entry.pickupStop, {
            stopId: route.stops[0].stopId, stopName: route.stops[0].stopName,
            sequenceOrder: route.stops[0].sequenceOrder, location: route.stops[0].location.toObject ? route.stops[0].location.toObject() : route.stops[0].location,
          });
          assert.deepEqual(entry.dropStop.toObject ? entry.dropStop.toObject() : entry.dropStop, {
            stopId: route.stops[1].stopId, stopName: route.stops[1].stopName,
            sequenceOrder: route.stops[1].sequenceOrder, location: route.stops[1].location.toObject ? route.stops[1].location.toObject() : route.stops[1].location,
          });
        }
      }
      const firstState = normalizeTrips(persisted);
      const rerun = await generateForServiceDate(date);
      assert.equal(rerun.createdTrips, 0);
      assert.equal(rerun.updatedTrips, routeCounts.length);
      assert.equal(rerun.manifestEntries, 0);
      assert.deepEqual(normalizeTrips(await Trip.find({}).lean()), firstState);
    }
  ), { numRuns: 100 });
});

// Feature: torqq-four-model-handover, Property 8: Route-driver assignment behavior
// **Validates: Requirements 4.4, 4.6, 9.5**
test('Property 8: generation propagates active drivers and records exceptions for unassigned routes', async () => {
  await fc.assert(fc.asyncProperty(
    fc.array(fc.boolean(), { minLength: 1, maxLength: 4 }),
    fc.integer({ min: 0, max: 364 }),
    async (hasActiveDriver, dateOffset) => {
      const fixture = await createFixture({ routeCounts: hasActiveDriver.map(() => 1), activeDrivers: hasActiveDriver });
      const date = serviceDate(dateOffset);
      await generateForServiceDate(date);
      const trips = await Trip.find({}).lean();
      const exceptions = await OperationalException.find({ type: 'UNASSIGNED_DRIVER' }).lean();
      assert.equal(trips.length, hasActiveDriver.length);
      assert.equal(exceptions.length, hasActiveDriver.filter((assigned) => !assigned).length);
      for (const { route, driver } of fixture.routes) {
        const trip = trips.find((candidate) => candidate.routeId.toString() === route._id.toString());
        assert.ok(trip);
        if (driver) {
          assert.equal(trip.driverId.toString(), driver._id.toString());
          assert.equal(exceptions.some((exception) => exception.routeId.toString() === route._id.toString()), false);
        } else {
          assert.equal(trip.driverId, null);
          const exception = exceptions.find((candidate) => candidate.routeId.toString() === route._id.toString());
          assert.ok(exception);
          assert.equal(exception.tripId.toString(), trip._id.toString());
          assert.equal(exception.serviceDate.getTime(), serviceDate(dateOffset).getTime());
        }
      }
    }
  ), { numRuns: 100 });
});
