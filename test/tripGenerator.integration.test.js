const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const db = require('./helpers/db');

const Customer = require('../models/Customer');
const Driver = require('../models/Driver');
const OperationalException = require('../models/OperationalException');
const Plan = require('../models/Plan');
const Route = require('../models/Route');
const Subscription = require('../models/Subscription');
const Trip = require('../models/Trip');
const { generateRecoveryTrips } = require('../controllers/tripGenerationController');
const { generateForServiceDate } = require('../services/tripGenerator');

const serviceDate = new Date(2025, 0, 6);
const objectId = () => new mongoose.Types.ObjectId();

function invoke(handler, body) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: undefined,
      status(code) { this.statusCode = code; return this; },
      json(response) { resolve({ statusCode: this.statusCode, body: response }); },
    };
    handler({ body }, res, reject);
  });
}

async function createFixture({ withDriver = false } = {}) {
  const plan = await Plan.create({
    name: 'Scheduled Stop-to-Stop', serviceType: 'Stop-to-Stop', tier: 'Standard',
    durationDays: 365, price: 100, bookingRules: { isSharedRide: true, useManagedStops: true },
  });
  const driver = withDriver ? await Driver.create({
    userId: objectId(), name: 'Integration Driver', vehicleNumber: 'KA01AB1000',
    vehicleModel: 'Van', vehicleCapacity: 6, licenseNumber: 'LICENSE-1000', status: 'ACTIVE',
  }) : null;
  const route = await Route.create({
    name: 'Integration Route', startLocation: 'Start', endLocation: 'End', assignedDriver: driver?._id,
    stops: [
      { stopId: 'pickup', stopName: 'Pickup', sequenceOrder: 10, location: { type: 'Point', coordinates: [77.5, 12.5] } },
      { stopId: 'drop', stopName: 'Drop', sequenceOrder: 20, location: { type: 'Point', coordinates: [77.6, 12.6] } },
    ],
  });
  const customer = await Customer.create({ userId: objectId(), name: 'Integration Passenger' });
  const subscription = await Subscription.create({
    customerId: customer._id, planId: plan._id, routeId: route._id,
    startDate: new Date(2024, 0, 1), endDate: new Date(2026, 11, 31), status: 'ACTIVE',
    pickupStopId: 'pickup', dropStopId: 'drop', pickupStopSequence: 10, dropStopSequence: 20,
  });
  return { route, driver, subscription };
}

test.before(async () => { await db.connect(); });
test.beforeEach(async () => {
  // Clear documents, keep indexes — see test/helpers/db.js.
  await db.resetData();
});
test.after(async () => { await db.disconnect(); });

test('persists one unique route/date trip and manifest when recovery generation overlaps', async () => {
  const { route, subscription } = await createFixture({ withDriver: true });
  await Promise.all([generateForServiceDate(serviceDate), generateForServiceDate(serviceDate)]);

  const trips = await Trip.find({ routeId: route._id, serviceDate }).lean();
  assert.equal(trips.length, 1);
  assert.equal(trips[0].manifest.length, 1);
  assert.equal(trips[0].manifest[0].subscriptionId.toString(), subscription._id.toString());
});

test('rolls back a newly created trip and records an exception when configured driver assignment cannot persist', async () => {
  const { route, driver } = await createFixture({ withDriver: true });
  const originalSave = Trip.prototype.save;
  Trip.prototype.save = async function failConfiguredAssignment(...args) {
    if (!this.isNew && this.driverId?.toString() === driver._id.toString()) {
      throw new Error('configured driver assignment write failed');
    }
    return originalSave.apply(this, args);
  };

  try {
    const result = await generateForServiceDate(serviceDate);
    assert.equal(result.createdTrips, 0);
  } finally {
    Trip.prototype.save = originalSave;
  }

  assert.equal(await Trip.countDocuments({ routeId: route._id, serviceDate }), 0);
  const exception = await OperationalException.findOne({
    routeId: route._id, serviceDate, type: 'DRIVER_ASSIGNMENT_FAILED', status: 'OPEN',
  }).lean();
  assert.ok(exception);
  assert.match(exception.reason, /configured driver assignment write failed/);
});

test('creates an unassigned trip and observable exception when no active driver is assigned', async () => {
  const { route } = await createFixture();
  const result = await generateForServiceDate(serviceDate);
  assert.equal(result.createdTrips, 1);

  const trip = await Trip.findOne({ routeId: route._id, serviceDate }).lean();
  assert.equal(trip.driverId, null);
  const exception = await OperationalException.findOne({
    routeId: route._id, tripId: trip._id, serviceDate, type: 'UNASSIGNED_DRIVER', status: 'OPEN',
  }).lean();
  assert.ok(exception);
});

test('administrator recovery rerun preserves the existing route/date trip and manifest', async () => {
  const { route, subscription } = await createFixture({ withDriver: true });
  await generateForServiceDate(serviceDate);

  const response = await invoke(generateRecoveryTrips, {
    startDate: '2025-01-06', endDate: '2025-01-06', routeIds: [route._id.toString()],
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.length, 1);
  assert.equal(response.body.data[0].createdTrips, 0);
  assert.equal(response.body.data[0].updatedTrips, 1);
  assert.equal(response.body.data[0].manifestEntries, 0);
  const trips = await Trip.find({ routeId: route._id, serviceDate }).lean();
  assert.equal(trips.length, 1);
  assert.equal(trips[0].manifest.length, 1);
  assert.equal(trips[0].manifest[0].subscriptionId.toString(), subscription._id.toString());
});
