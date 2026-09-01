const assert = require('node:assert/strict');
const test = require('node:test');

const db = require('./helpers/db');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Driver = require('../models/Driver');
const Area = require('../models/Area');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const Trip = require('../models/Trip');
const subscriptionService = require('../services/subscriptionService');
const { regenerateForSubscription, generateTripsForDate } = require('../services/DailyTripGenerator');
const { acceptTrip } = require('../services/TripAssignmentService');

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
  // A second plan, so tests can hold two subscriptions of different types.
  await Plan.create({
    name: 'Hybrid Commute',
    serviceType: 'Home-to-Office',
    tier: 'Hybrid',
    durationDays: 30,
    price: 1799,
    pauseDaysAllowed: 3,
    isActive: true,
    bookingRules: { allowedDaysPerWeek: 3, allowedWeekdays: [], isSharedRide: true },
  });
  return { area, driver, driverUser, customer, customerUser };
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
  await db.connect();
});

test.after(async () => {
  await db.disconnect();
});

test.beforeEach(async () => {
  // Clears documents but keeps indexes — the unique partial indexes here are the
  // real enforcement, and Area's 2dsphere index is what $geoNear needs.
  await db.resetData();
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

test('a customer can hold several subscriptions at different pickup times', async () => {
  const { customerUser } = await seedWorld({ walletBalance: 20000 });

  const morning = await subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody({ pickupTime: '08:00' }) });
  const evening = await subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody({ pickupTime: '18:00' }) });
  // Different type and pickup time — no schedule-slot overlap with the weekday commutes.
  const saturday = await subscriptionService.createSubscription({
    userId: customerUser._id,
    ...bookingBody({ subscriptionType: 'HYBRID', scheduleDays: [2, 4, 5], pickupTime: '09:30' }),
  });

  assert.equal(morning.subscription.status, 'ACTIVE');
  assert.equal(evening.subscription.status, 'ACTIVE');
  assert.equal(saturday.subscription.status, 'ACTIVE');

  const customer = await Customer.findOne({ userId: customerUser._id });
  const current = await Subscription.countDocuments({ customerId: customer._id, isCurrent: true });
  assert.equal(current, 3, 'all three should be live at once');
  assert.equal(customer.walletBalance, 20000 - 1999 - 1999 - 1799);

  const { subscriptions } = await subscriptionService.listSubscriptions({ userId: customerUser._id });
  assert.equal(subscriptions.length, 3);
});

test('a second subscription clashing on time and day is rejected', async () => {
  const { customerUser } = await seedWorld({ walletBalance: 20000 });
  // WEEKDAYS runs Mon–Fri at 08:00.
  await subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody() });

  // HYBRID on Mon/Wed/Fri at 08:00 overlaps three of those days at the same time.
  await assert.rejects(
    subscriptionService.createSubscription({
      userId: customerUser._id,
      ...bookingBody({ subscriptionType: 'HYBRID', scheduleDays: [1, 3, 5], pickupTime: '08:00' }),
    }),
    /picking you up at 08:00/i
  );

  const customer = await Customer.findOne({ userId: customerUser._id });
  const current = await Subscription.countDocuments({ customerId: customer._id, isCurrent: true });
  assert.equal(current, 1, 'the clashing booking must not land');
});

test('two subscriptions at the same time on disjoint days are both allowed', async () => {
  const { customerUser } = await seedWorld({ walletBalance: 20000 });
  // Different valid three-day schedules at different times can coexist.
  await subscriptionService.createSubscription({
    userId: customerUser._id,
    ...bookingBody({ subscriptionType: 'HYBRID', scheduleDays: [1, 2, 3], pickupTime: '08:00' }),
  });
  await subscriptionService.createSubscription({
    userId: customerUser._id,
    ...bookingBody({ subscriptionType: 'HYBRID', scheduleDays: [3, 4, 5], pickupTime: '18:00' }),
  });

  const customer = await Customer.findOne({ userId: customerUser._id });
  const current = await Subscription.countDocuments({ customerId: customer._id, isCurrent: true });
  assert.equal(current, 2);
});

test('concurrent booking of the same pickup slot is blocked by the unique index', async () => {
  const { customerUser } = await seedWorld({ walletBalance: 20000 });
  const results = await Promise.allSettled([
    subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody() }),
    subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody() }),
  ]);
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  assert.equal(fulfilled.length, 1, 'exactly one concurrent booking of the same slot should succeed');
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

test('assigned driver can accept a trip with the authenticated user ObjectId', async () => {
  const { customerUser, driver, driverUser } = await seedWorld();
  const serviceDate = new Date();
  serviceDate.setHours(0, 0, 0, 0);
  const trip = await Trip.create({
    driverId: driver._id,
    serviceDate,
    pickupTime: '08:00',
    passengers: [{ customerId: (await Customer.findOne({ userId: customerUser._id }))._id }],
  });
  const result = await acceptTrip(trip._id, driverUser._id);

  assert.equal(result.success, true);
  assert.equal(result.trip.assignmentStatus, 'ACCEPTED');
  assert.equal(result.trip.status, 'ACCEPTED');
});

test('a customer\'s two pickup times become two separate trips, same driver', async () => {
  // The point of holding several subscriptions: each one has to produce its own
  // ride. Trips keyed by { driverId, serviceDate } alone merged these into a
  // single 08:00 trip carrying the customer twice.
  const { customerUser, driver } = await seedWorld({ walletBalance: 20000 });
  const morning = await subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody({ pickupTime: '08:00' }) });
  const evening = await subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody({ pickupTime: '18:00' }) });

  await regenerateForSubscription(morning.subscription._id, { days: 3 });
  await regenerateForSubscription(evening.subscription._id, { days: 3 });

  // Take the earliest service date both subscriptions run on (WEEKDAYS: Mon–Fri).
  const trips = await Trip.find({ driverId: driver._id }).sort({ serviceDate: 1, pickupTime: 1 });
  const firstDate = trips[0].serviceDate.getTime();
  const sameDay = trips.filter((t) => t.serviceDate.getTime() === firstDate);

  assert.equal(sameDay.length, 2, 'one trip per pickup time, not one per driver-day');
  assert.deepEqual(sameDay.map((t) => t.pickupTime), ['08:00', '18:00']);

  // Each trip carries exactly its own subscription — not both.
  const [am, pm] = sameDay;
  assert.deepEqual(am.passengers.map((p) => p.subscriptionId.toString()), [morning.subscription._id.toString()]);
  assert.deepEqual(pm.passengers.map((p) => p.subscriptionId.toString()), [evening.subscription._id.toString()]);
});

test('generateTripsForDate builds one trip per pickup slot', async () => {
  const { customerUser, driver } = await seedWorld({ walletBalance: 20000 });
  await subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody({ pickupTime: '08:00' }) });
  await subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody({ pickupTime: '18:00' }) });

  // Next Monday — a day both WEEKDAYS subscriptions run.
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1);

  await Trip.deleteMany({}); // ignore trips the matching hook already made
  const result = await generateTripsForDate(monday);
  assert.equal(result.createdTrips, 2);

  const trips = await Trip.find({ driverId: driver._id, serviceDate: monday }).sort({ pickupTime: 1 });
  assert.deepEqual(trips.map((t) => t.pickupTime), ['08:00', '18:00']);
});

test('regenerating is idempotent — a second pass creates no duplicate trip', async () => {
  const { customerUser, driver } = await seedWorld();
  const { subscription } = await subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody() });

  await regenerateForSubscription(subscription._id, { days: 5 });
  const before = await Trip.countDocuments({ driverId: driver._id });
  const second = await regenerateForSubscription(subscription._id, { days: 5 });

  assert.equal(second.created, 0, 'the slot lookup must find the existing trips');
  assert.equal(await Trip.countDocuments({ driverId: driver._id }), before);
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

test('cancelling without an id is refused when several subscriptions are live', async () => {
  const { customerUser } = await seedWorld({ walletBalance: 20000 });
  await subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody({ pickupTime: '08:00' }) });
  await subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody({ pickupTime: '18:00' }) });

  await assert.rejects(
    subscriptionService.cancelSubscription({ userId: customerUser._id }),
    /2 active subscriptions/i
  );
});

test('cancelling one subscription leaves the others running and repoints the primary', async () => {
  const { customerUser } = await seedWorld({ walletBalance: 20000 });
  const morning = await subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody({ pickupTime: '08:00' }) });
  const evening = await subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody({ pickupTime: '18:00' }) });

  const result = await subscriptionService.cancelSubscription({
    userId: customerUser._id,
    subscriptionId: morning.subscription._id,
  });
  assert.equal(result.subscription.status, 'CANCELLED');

  const survivor = await Subscription.findById(evening.subscription._id);
  assert.equal(survivor.status, 'ACTIVE');
  assert.equal(survivor.isCurrent, true);

  // The primary pointer must move to the survivor, not be blanked — otherwise
  // the customer looks unsubscribed while a subscription is still running.
  assert.equal(result.remainingPrimary.toString(), evening.subscription._id.toString());
  const customer = await Customer.findOne({ userId: customerUser._id });
  assert.equal(customer.subscriptionId.toString(), evening.subscription._id.toString());
});

test('cancelling frees the pickup slot for a fresh subscription at the same time', async () => {
  const { customerUser } = await seedWorld({ walletBalance: 20000 });
  const first = await subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody() });
  await subscriptionService.cancelSubscription({ userId: customerUser._id, subscriptionId: first.subscription._id });

  const second = await subscriptionService.createSubscription({ userId: customerUser._id, ...bookingBody() });
  assert.equal(second.subscription.status, 'ACTIVE');
});
