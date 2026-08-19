const assert = require('node:assert/strict');
const test = require('node:test');

const RideRequest = require('../models/RideRequest');
const { schemas, validateSocketEvent } = require('../validations/socketValidation');

const validateRideRequest = validateSocketEvent(schemas.rideRequest);
const location = { address: 'Example address', coordinates: [77.5946, 12.9716] };

function booking(overrides = {}) {
  return {
    pickup: location,
    drop: { address: 'Destination', coordinates: [77.6046, 12.9816] },
    pickupIntent: 'IMMEDIATE',
    ...overrides,
  };
}

test('RideRequest records explicit Flexy pickup intent and scheduled pickup timestamp', () => {
  const pickupIntent = RideRequest.schema.path('pickupIntent');
  assert.deepEqual(pickupIntent.enumValues, ['IMMEDIATE', 'SCHEDULED']);
  assert.equal(pickupIntent.options.required, true);
  assert.ok(RideRequest.schema.path('scheduledPickupAt').options.index);
});

test('Flexy booking validation accepts immediate and future scheduled intents only', () => {
  const immediate = validateRideRequest(booking());
  assert.equal(immediate.valid, true);
  assert.equal(immediate.value.pickupIntent, 'IMMEDIATE');
  assert.equal(immediate.value.scheduledPickupAt, undefined);

  const scheduledPickupAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const scheduled = validateRideRequest(booking({ pickupIntent: 'SCHEDULED', scheduledPickupAt }));
  assert.equal(scheduled.valid, true);
  assert.equal(scheduled.value.pickupIntent, 'SCHEDULED');
  assert.equal(scheduled.value.scheduledPickupAt.toISOString(), scheduledPickupAt);
});

test('Flexy booking validation rejects ambiguous, past, and malformed scheduled pickup times', () => {
  assert.equal(validateRideRequest(booking({ pickupIntent: 'SCHEDULED' })).valid, false);
  assert.equal(validateRideRequest(booking({ scheduledPickupAt: new Date(Date.now() + 3600000).toISOString() })).valid, false);
  assert.equal(validateRideRequest(booking({ pickupIntent: 'SCHEDULED', scheduledPickupAt: new Date(Date.now() - 1000).toISOString() })).valid, false);
  assert.equal(validateRideRequest(booking({ pickupIntent: 'SCHEDULED', scheduledPickupAt: 'not-a-date' })).valid, false);
});