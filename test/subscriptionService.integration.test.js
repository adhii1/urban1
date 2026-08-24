const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const Customer = require('../models/Customer');
const Driver = require('../models/Driver');
const Area = require('../models/Area');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const Trip = require('../models/Trip');
const subscriptionService = require('../services/subscriptionService');
const { regenerateForSubscription, generateTripsForDate } = require('../services/DailyTripGenerator');

let mongoServer;

const AREA_CENTER = [77.6501, 12.9141]; // [lng, lat]

async function seedWorld({ walletBalance = 5000 } = {}) {
  const area = await Area.create({
    name: 'HSR Layout',
    center: { type: 'Point', coordinates: AREA_CENTER },
    radiusKm: 5,
    status: 'ACTIVE',
  });
  const driverUser = await User.create({ phone: '9000000002', password: 'x', role: 'Driver', status: 'ACTIVE' });
  const driver = await Driver.create({
    userId: driverUser._id,
    name: 'Raju',
    vehicleNumber: 'KA51AB1234',
    vehicleModel: 'Swift',
    vehicleCapacity: 4,
    licenseNumber: 'KA2020',
    areaId: area._id,
    status: 'ACTIVE',
    currentLocation: { type: 'Point', coordinates: AREA_CENTER },
  });
  const customerUser = await User.create({ phone: '9000000003', password: 'x', role: 'Customer', status: 'ACTIVE' });
  const customer = await Customer.create({
    userId: customerUser._id,
    name: 'Priya',
    walletBalance,
    homeLocation: { address: 'HSR', type: 'Point', coordinates: AREA_CENTER },
  });
  await Plan.create({
    name: 'Weekday Commute',
    serviceType: 'Home-to-Office',
    tier: 'Weekday',
    durationDays: 30,
    price: 1999,
    pauseDaysAllowed: 4,
    isActive: true,
    bookingRules: { allowedDaysPerWeek: 5, allowedWeekdays: [1, 2, 3, 4, 5], isSharedRide: true },
  });
  return { area, driver, customer, customerUser };
}

function bookingBody(overrides = {}) {
  return {
    subscriptionType: 'WEEKDAYS',
    pickupLocation: { address: 'Home', coordinates: AREA_CENTER },
    dropLocation: { address: 'Office', coordinates: [77.6683, 12.8489] },
    pickupTime: '08:00',
    paymentMethod: 'wallet',
    ...overrides,
  };
}

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

test.beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  await Subscription.syncIndexes(); // ensure the partial unique index exists
});

test('wallet subscription activates, debits the wallet, and matches a driver', async () => {
  const { customerUser, driver } = await seedWorld();
  const result = await subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody() });

  assert.equal(result.requiresPayment, false);
  assert.equal(result.subscription.status, 'ACTIVE');
  assert.equal(result.subscription.isCurrent, true);
  assert.equal(result.subscription.subscriptionType, 'WEEKDAYS');
  assert.equal(result.match.success, true);
  assert.equal(result.match.driver._id.toString(), driver._id.toString());

  const customer = await Customer.findOne({ userId: customerUser._id });
  assert.equal(customer.walletBalance, 5000 - 1999); // debited exactly once
});

test('a customer cannot hold two current subscriptions (atomic guard)', async () => {
  const { customerUser } = await seedWorld();
  await subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody() });

  await assert.rejects(
    subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody({ subscriptionType: 'HYBRID', scheduleDays: [1, 3, 5] }) }),
    /already have an active subscription/i
  );
  const count = await Subscription.countDocuments({ customerId: (await Customer.findOne({ userId: customerUser._id }))._id, isCurrent: true });
  assert.equal(count, 1);
});

test('concurrent double-booking is blocked by the unique index', async () => {
  const { customerUser } = await seedWorld();
  const results = await Promise.allSettled([
    subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody() }),
    subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody() }),
  ]);
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  assert.equal(fulfilled.length, 1, 'exactly one concurrent booking should succeed');
});

test('missing plan throws instead of fabricating one', async () => {
  const { customerUser } = await seedWorld();
  await Plan.deleteMany({});
  await assert.rejects(
    subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody() }),
    /no active WEEKDAYS plan is configured/i
  );
});

test('insufficient wallet balance rejects and leaves no current subscription', async () => {
  const { customerUser } = await seedWorld({ walletBalance: 100 });
  await assert.rejects(
    subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody() }),
    /insufficient wallet balance/i
  );
  const customer = await Customer.findOne({ userId: customerUser._id });
  assert.equal(customer.walletBalance, 100); // not debited
  const current = await Subscription.countDocuments({ customerId: customer._id, isCurrent: true });
  assert.equal(current, 0); // slot released
});

test('regenerateForSubscription creates trips with passengers[] on schedule days', async () => {
  const { customerUser, driver } = await seedWorld();
  const { subscription } = await subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody() });
  const res = await regenerateForSubscription(subscription._id, { days: 14 });
  assert.ok(res.created >= 1, 'should create at least one trip in the next 14 days');

  const trips = await Trip.find({ driverId: driver._id });
  assert.ok(trips.length >= 1);
  const trip = trips[0];
  assert.equal(trip.passengers.length, 1);
  assert.equal(trip.passengers[0].subscriptionId.toString(), subscription._id.toString());
  assert.ok(trip.passengers[0].otp.code, 'passenger should have an OTP');
});

test('a late subscriber is merged into an existing trip, not dropped', async () => {
  const { customerUser, driver, area } = await seedWorld();
  // First subscriber -> creates the trip.
  const first = await subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody() });
  await regenerateForSubscription(first.subscription._id, { days: 3 });

  // A second customer assigned to the same driver.
  const u2 = await User.create({ phone: '9000000004', password: 'x', role: 'Customer', status: 'ACTIVE' });
  const c2 = await Customer.create({ userId: u2._id, name: 'Anil', walletBalance: 5000, homeLocation: { type: 'Point', coordinates: AREA_CENTER } });
  const second = await subscriptionService.createSubscription({ userId: u2._id, ...bookingBody() });
  await regenerateForSubscription(second.subscription._id, { days: 3 });

  // The next scheduled trip should carry both passengers.
  const trip = await Trip.findOne({ driverId: driver._id }).sort({ serviceDate: 1 });
  const subIds = trip.passengers.map((p) => p.subscriptionId.toString());
  assert.ok(subIds.includes(first.subscription._id.toString()));
  assert.ok(subIds.includes(second.subscription._id.toString()), 'late subscriber must be merged');
});

test('cancel releases the slot and reconciles future trips', async () => {
  const { customerUser, driver } = await seedWorld();
  const { subscription } = await subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody() });
  await regenerateForSubscription(subscription._id, { days: 7 });

  await subscriptionService.cancelSubscription({ userId: customerUser._id });

  const fresh = await Subscription.findById(subscription._id);
  assert.equal(fresh.status, 'CANCELLED');
  assert.equal(fresh.isCurrent, false);

  // Its passenger is removed from future scheduled trips (and empty trips cancelled).
  const remaining = await Trip.countDocuments({ 'passengers.subscriptionId': subscription._id, status: 'SCHEDULED' });
  assert.equal(remaining, 0);
});
