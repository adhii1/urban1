const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizeScheduleDays, upcomingServiceDates } = require('../services/subscriptionService');
const { optimizePickupOrder, normalizePickupTime } = require('../services/DailyTripGenerator');
const { buildNavigationUrl } = require('../services/shuttleService');
const { generateBundles } = require('../services/SpatialClusterService');
const Subscription = require('../models/Subscription');
const Trip = require('../models/Trip');

// These are pure functions — no DB or network — so they run anywhere.

test('normalizeScheduleDays: WEEKDAYS and SHUTTLE are Mon–Fri', () => {
  assert.deepEqual(normalizeScheduleDays('WEEKDAYS', undefined), [1, 2, 3, 4, 5]);
  assert.deepEqual(normalizeScheduleDays('SHUTTLE', [1, 2]), [1, 2, 3, 4, 5]);
});

test('normalizeScheduleDays: HYBRID requires exactly 3 distinct weekdays', () => {
  assert.deepEqual(normalizeScheduleDays('HYBRID', [5, 1, 3]), [1, 3, 5]);
  assert.throws(() => normalizeScheduleDays('HYBRID', [1, 1, 2]), /exactly 3 different weekdays/i);
  assert.throws(() => normalizeScheduleDays('HYBRID', [1, 2, 3, 4]), /exactly 3 different weekdays/i);
});

test('normalizeScheduleDays: HYBRID rejects empty / weekend days', () => {
  assert.throws(() => normalizeScheduleDays('HYBRID', []), /exactly 3 different weekdays/i);
  assert.throws(() => normalizeScheduleDays('HYBRID', [1, 2, 6]), /exactly 3 different weekdays/i);
});

test('upcomingServiceDates returns only scheduled weekdays, in order', () => {
  // 2026-08-24 is a Monday.
  const start = new Date('2026-08-24T00:00:00');
  const dates = upcomingServiceDates([1, 3, 5], start, 3); // Mon, Wed, Fri
  assert.deepEqual(dates, ['2026-08-24', '2026-08-26', '2026-08-28']);
});

test('optimizePickupOrder visits nearest pickups first from the driver', () => {
  const driver = [77.60, 12.90];
  const passengers = [
    { pickupLocation: { coordinates: [77.70, 12.90] } }, // far
    { pickupLocation: { coordinates: [77.61, 12.90] } }, // near
    { pickupLocation: { coordinates: [77.65, 12.90] } }, // mid
  ];
  const ordered = optimizePickupOrder(driver, passengers);
  assert.deepEqual(ordered.map((p) => p.pickupOrder), [1, 2, 3]);
  assert.equal(ordered[0].pickupLocation.coordinates[0], 77.61); // nearest first
  assert.equal(ordered[2].pickupLocation.coordinates[0], 77.70); // farthest last
});

// --- Multiple concurrent subscriptions ---
//
// The rule is enforced by an index, not by application code, so these assert the
// schema declaration itself. They need no DB, which matters because the
// integration tests can't run in every environment.

/** Declared indexes as [keySpec, options] pairs. */
const declaredIndexes = () => Subscription.schema.indexes();

test('the schema no longer declares a unique index on customerId alone', () => {
  // This was the single-subscription-per-customer constraint. If it comes back,
  // a customer's second subscription fails with an opaque E11000.
  const offender = declaredIndexes().find(([key, opts]) =>
    opts && opts.unique && Object.keys(key).length === 1 && key.customerId === 1);
  assert.equal(offender, undefined, 'a unique { customerId } index would forbid multiple subscriptions');
});

test('the schedule-slot index guards pickupTime + day, scoped to current subscriptions', () => {
  const found = declaredIndexes().find(([, opts]) => opts && opts.name === 'customer_schedule_slot_unique');
  assert.ok(found, 'customer_schedule_slot_unique must be declared');

  const [key, opts] = found;
  // Order matters: customerId is the equality prefix, so the index also serves
  // findConflictingSubscription's query.
  assert.deepEqual(Object.keys(key), ['customerId', 'pickupTime', 'scheduleDays']);
  assert.equal(opts.unique, true);
  // Partial on isCurrent so cancelled/expired subscriptions release their slot.
  // It must be an equality predicate — Mongo rejects $in in a partial filter.
  assert.deepEqual(opts.partialFilterExpression, { isCurrent: true });
});

// --- One trip per pickup slot, not per driver-day ---
//
// Holding several subscriptions is only useful if each one actually produces its
// own ride. Trips used to be unique per { driverId, serviceDate }, so a
// customer's 08:00 and 18:00 subscriptions with the same driver collapsed into a
// single 08:00 trip. Schema-level assertions, so they run without a DB.

test('trips are unique per driver + date + pickup time, not per driver-day', () => {
  const tripIndexes = Trip.schema.indexes();

  const stale = tripIndexes.find(([key, opts]) =>
    opts && opts.unique
    && Object.keys(key).length === 2
    && key.driverId === 1 && key.serviceDate === 1);
  assert.equal(stale, undefined, 'a unique { driverId, serviceDate } index merges a driver\'s separate runs');

  const found = tripIndexes.find(([, opts]) => opts && opts.name === 'driver_service_slot_unique');
  assert.ok(found, 'driver_service_slot_unique must be declared');
  const [key, opts] = found;
  assert.deepEqual(Object.keys(key), ['driverId', 'serviceDate', 'pickupTime']);
  assert.equal(opts.unique, true);
  // Scoped to trips that actually have a driver. Route-based trips are inserted
  // with driverId: null before a driver is resolved; without the $type predicate
  // every driverless trip on a date keys as { null, date, null } and the second
  // one fails with E11000. `$exists: true` would not do — it matches null.
  assert.deepEqual(opts.partialFilterExpression, {
    isDeleted: false,
    driverId: { $type: 'objectId' },
  });
});

test('normalizePickupTime makes lookup and create agree on one key', () => {
  // "8:00" and "08:00" are the same run. If they hashed differently, the trip
  // lookup would miss and generate a duplicate trip for a ride that exists.
  assert.equal(normalizePickupTime('8:00'), '08:00');
  assert.equal(normalizePickupTime('08:00'), '08:00');
  assert.equal(normalizePickupTime(' 18:30 '), '18:30');
  // No pickup time recorded — fall back, and consistently.
  assert.equal(normalizePickupTime(undefined), '08:00');
  assert.equal(normalizePickupTime(''), '08:00');
  // Unparseable input is passed through, never remapped to a time the customer
  // didn't ask for.
  assert.equal(normalizePickupTime('morning'), 'morning');
  assert.equal(normalizePickupTime('25:00'), '25:00');
  assert.equal(normalizePickupTime('08:75'), '08:75');
});

test('shuttle bundling keeps up to six compatible passengers together', () => {
  const ride = (id) => ({
    _id: id,
    pickupLocation: { coordinates: [77.6 + id * 0.001, 12.9] },
    dropLocation: { coordinates: [77.7 + id * 0.001, 12.95] },
  });
  const primary = ride(0);
  const bundle = generateBundles(primary, [1, 2, 3, 4, 5, 6].map(ride));

  assert.equal(bundle.length, 1);
  assert.equal(bundle[0].length, 6);
  assert.equal(bundle[0][0]._id, primary._id);
});

test('shuttle navigation removes duplicate shared-destination stops', () => {
  const sequence = [
    { type: 'PICKUP', status: 'PENDING', location: { coordinates: [77.6, 12.9] } },
    { type: 'DROP', status: 'PENDING', location: { coordinates: [77.7, 12.95] } },
    { type: 'DROP', status: 'PENDING', location: { coordinates: [77.7, 12.95] } },
  ];
  const url = buildNavigationUrl(sequence);

  assert.equal(url.match(/12\.95,77\.7/g).length, 1);
  assert.match(url, /waypoints=12\.9,77\.6/);
});
