const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizeScheduleDays, upcomingServiceDates } = require('../services/subscriptionService');
const { optimizePickupOrder } = require('../services/DailyTripGenerator');

// These are pure functions — no DB or network — so they run anywhere.

test('normalizeScheduleDays: WEEKDAYS and SHUTTLE are Mon–Fri', () => {
  assert.deepEqual(normalizeScheduleDays('WEEKDAYS', undefined), [1, 2, 3, 4, 5]);
  assert.deepEqual(normalizeScheduleDays('SHUTTLE', [1, 2]), [1, 2, 3, 4, 5]);
});

test('normalizeScheduleDays: HYBRID dedupes, sorts, and caps at 3 days', () => {
  assert.deepEqual(normalizeScheduleDays('HYBRID', [5, 1, 3]), [1, 3, 5]);
  assert.deepEqual(normalizeScheduleDays('HYBRID', [1, 1, 2, 2, 3, 4]), [1, 2, 3]);
});

test('normalizeScheduleDays: HYBRID rejects empty / out-of-range', () => {
  assert.throws(() => normalizeScheduleDays('HYBRID', []), /select 1.?3 commute days/i);
  assert.throws(() => normalizeScheduleDays('HYBRID', [0, 7, 9]), /Invalid schedule days/i);
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
