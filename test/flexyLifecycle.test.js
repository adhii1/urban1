const assert = require('node:assert/strict');
const test = require('node:test');
const fc = require('fast-check');
const mongoose = require('mongoose');
const db = require('./helpers/db');
const RideRequest = require('../models/RideRequest');
const { createFlexyRide, promoteDueFlexyRides, FLEXY_CODES } = require('../services/flexyService');
const { runDueFlexyPromotion } = require('../jobs/promoteScheduledFlexyRides');

const pickupLocation = { address: 'Pickup', type: 'Point', coordinates: [77.5946, 12.9716] };
const dropLocation = { address: 'Drop', type: 'Point', coordinates: [77.6046, 12.9816] };
const customerId = () => new mongoose.Types.ObjectId();
const rideInput = (overrides = {}) => ({ customerId: customerId(), pickupLocation, dropLocation, ...overrides });

test.before(async () => { await db.connect(); });
test.beforeEach(async () => { await db.resetData(); }); // clears documents, keeps indexes
test.after(async () => { await db.disconnect(); });

// Feature: torqq-four-model-handover, Property 5: Flexy creation preserves pickup intent
// **Validates: Requirements 3.2, 3.3**
test('Property 5: creation retains valid immediate or future scheduled pickup intent', async () => {
  await fc.assert(fc.asyncProperty(fc.boolean(), fc.integer({ min: 1000, max: 86400000 }), async (scheduled, offsetMs) => {
    const scheduledPickupAt = new Date(Date.now() + offsetMs);
    const ride = await createFlexyRide(rideInput(scheduled
      ? { pickupIntent: 'SCHEDULED', scheduledPickupAt }
      : { pickupIntent: 'IMMEDIATE' }));
    assert.equal(ride.pickupIntent, scheduled ? 'SCHEDULED' : 'IMMEDIATE');
    assert.equal(ride.status, scheduled ? 'SCHEDULED' : 'PENDING');
    assert.equal(ride.scheduledPickupAt?.getTime(), scheduled ? scheduledPickupAt.getTime() : undefined);
  }), { numRuns: 100 });
});

// Feature: torqq-four-model-handover, Property 6: Due Flexy promotion is idempotent
// **Validates: Requirements 3.4, 3.5, 9.4**
test('Property 6: processor promotes due scheduled rides once and preserves not-due rides', async () => {
  const evaluationTime = new Date('2025-01-01T12:00:00.000Z');
  await fc.assert(fc.asyncProperty(fc.array(fc.integer({ min: -3600000, max: 3600000 }), { maxLength: 8 }), async (offsets) => {
    await RideRequest.deleteMany({});
    const rides = await RideRequest.create(offsets.map((offset, index) => ({
      customerId: customerId(), pickupLocation, dropLocation, pickupIntent: 'SCHEDULED', status: 'SCHEDULED',
      scheduledPickupAt: new Date(evaluationTime.getTime() + offset), customerName: `Passenger ${index}`,
    })));
    const dueCount = offsets.filter((offset) => offset <= 0).length;
    const firstRun = await promoteDueFlexyRides(evaluationTime);
    const secondRun = await promoteDueFlexyRides(evaluationTime);
    assert.equal(firstRun.promotedCount, dueCount);
    assert.equal(secondRun.promotedCount, 0);
    const persisted = await RideRequest.find({ _id: { $in: rides.map((ride) => ride._id) } }).lean();
    for (const ride of persisted) assert.equal(ride.status, ride.scheduledPickupAt <= evaluationTime ? 'PENDING' : 'SCHEDULED');
  }), { numRuns: 100 });
});

test('Flexy booking API creates immediate PENDING and future SCHEDULED rides', async () => {
  const immediate = await createFlexyRide(rideInput({ pickupIntent: 'IMMEDIATE' }));
  const scheduledPickupAt = new Date(Date.now() + 3600000);
  const scheduled = await createFlexyRide(rideInput({ pickupIntent: 'SCHEDULED', scheduledPickupAt }));
  assert.deepEqual(
    [immediate.status, immediate.pickupIntent, immediate.scheduledPickupAt],
    ['PENDING', 'IMMEDIATE', undefined]
  );
  assert.equal(scheduled.status, 'SCHEDULED');
  assert.equal(scheduled.pickupIntent, 'SCHEDULED');
  assert.equal(scheduled.scheduledPickupAt.getTime(), scheduledPickupAt.getTime());
});

test('Flexy booking API rejects malformed and past schedules without persistence', async () => {
  for (const scheduledPickupAt of ['invalid-date', new Date(Date.now() - 1000)]) {
    await assert.rejects(
      () => createFlexyRide(rideInput({ pickupIntent: 'SCHEDULED', scheduledPickupAt })),
      (error) => error.details?.code === (scheduledPickupAt === 'invalid-date'
        ? FLEXY_CODES.INVALID_SCHEDULED_PICKUP_AT
        : FLEXY_CODES.PAST_SCHEDULED_PICKUP_AT)
    );
  }
  assert.equal(await RideRequest.countDocuments(), 0);
});

test('due-time job transitions due rides and is idempotent on repeated execution', async () => {
  const dueTime = new Date('2025-01-01T12:00:00.000Z');
  const dueRide = await RideRequest.create({
    customerId: customerId(), pickupLocation, dropLocation, pickupIntent: 'SCHEDULED', status: 'SCHEDULED',
    scheduledPickupAt: new Date(dueTime.getTime() - 1),
  });
  const futureRide = await RideRequest.create({
    customerId: customerId(), pickupLocation, dropLocation, pickupIntent: 'SCHEDULED', status: 'SCHEDULED',
    scheduledPickupAt: new Date(dueTime.getTime() + 1),
  });
  const firstRun = await runDueFlexyPromotion(dueTime);
  const secondRun = await runDueFlexyPromotion(dueTime);
  assert.equal(firstRun.promotedCount, 1);
  assert.equal(secondRun.promotedCount, 0);
  assert.equal((await RideRequest.findById(dueRide._id)).status, 'PENDING');
  assert.equal((await RideRequest.findById(futureRide._id)).status, 'SCHEDULED');
});