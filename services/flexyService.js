const RideRequest = require('../models/RideRequest');
const { ValidationError } = require('../utils/AppError');

const FLEXY_CODES = Object.freeze({
  INVALID_PICKUP_INTENT: 'INVALID_FLEXY_PICKUP_INTENT',
  INVALID_SCHEDULED_PICKUP_AT: 'INVALID_FLEXY_SCHEDULED_PICKUP_AT',
  PAST_SCHEDULED_PICKUP_AT: 'PAST_FLEXY_SCHEDULED_PICKUP_AT',
  IMMEDIATE_SCHEDULED_PICKUP_AT: 'IMMEDIATE_FLEXY_SCHEDULED_PICKUP_AT',
});

const PENDING_RIDE_EXPIRY_MS = 5 * 60 * 1000;

function flexyValidationError(code, message) {
  return new ValidationError(message, { code });
}

function normalizeScheduledPickupAt(scheduledPickupAt, now) {
  if (scheduledPickupAt instanceof Date) {
    if (Number.isNaN(scheduledPickupAt.getTime())) {
      throw flexyValidationError(FLEXY_CODES.INVALID_SCHEDULED_PICKUP_AT, 'Scheduled pickup time must be a valid date.');
    }
    return scheduledPickupAt;
  }

  const parsed = new Date(scheduledPickupAt);
  if (scheduledPickupAt === undefined || scheduledPickupAt === null || Number.isNaN(parsed.getTime())) {
    throw flexyValidationError(FLEXY_CODES.INVALID_SCHEDULED_PICKUP_AT, 'Scheduled pickup time must be a valid date.');
  }
  return parsed;
}

/**
 * Create an on-demand Flexy RideRequest with an explicit pickup lifecycle.
 * Scheduled pickup times are always validated again on the server because
 * socket/API validation alone cannot protect direct service callers.
 */
async function createFlexyRide({
  customerId,
  pickupLocation,
  dropLocation,
  pickupIntent,
  scheduledPickupAt,
  ...rideDetails
}) {
  const now = new Date();

  if (!['IMMEDIATE', 'SCHEDULED'].includes(pickupIntent)) {
    throw flexyValidationError(FLEXY_CODES.INVALID_PICKUP_INTENT, 'Pickup intent must be IMMEDIATE or SCHEDULED.');
  }

  if (pickupIntent === 'IMMEDIATE' && scheduledPickupAt !== undefined && scheduledPickupAt !== null) {
    throw flexyValidationError(FLEXY_CODES.IMMEDIATE_SCHEDULED_PICKUP_AT, 'Immediate rides cannot include a scheduled pickup time.');
  }

  let normalizedScheduledPickupAt;
  if (pickupIntent === 'SCHEDULED') {
    normalizedScheduledPickupAt = normalizeScheduledPickupAt(scheduledPickupAt, now);
    if (normalizedScheduledPickupAt <= now) {
      throw flexyValidationError(FLEXY_CODES.PAST_SCHEDULED_PICKUP_AT, 'Scheduled pickup time must be in the future.');
    }
  }

  return RideRequest.create({
    customerId,
    pickupLocation,
    dropLocation,
    ...rideDetails,
    pickupIntent,
    scheduledPickupAt: normalizedScheduledPickupAt,
    status: pickupIntent === 'SCHEDULED' ? 'SCHEDULED' : 'PENDING',
  });
}

/**
 * Atomically claim and promote every due scheduled Flexy request. The query
 * includes the predecessor state, so overlapping job executions can return a
 * ride at most once and only the caller that changed it starts matching.
 */
async function promoteDueFlexyRides(now = new Date()) {
  const evaluationTime = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(evaluationTime.getTime())) {
    throw flexyValidationError(FLEXY_CODES.INVALID_SCHEDULED_PICKUP_AT, 'Promotion time must be a valid date.');
  }

  const promotedRideIds = [];
  const expiresAt = new Date(evaluationTime.getTime() + PENDING_RIDE_EXPIRY_MS);

  while (true) {
    const promotedRide = await RideRequest.findOneAndUpdate(
      {
        status: 'SCHEDULED',
        pickupIntent: 'SCHEDULED',
        scheduledPickupAt: { $lte: evaluationTime },
        isDeleted: false,
      },
      {
        $set: {
          status: 'PENDING',
          requestedAt: evaluationTime,
          expiresAt,
        },
      },
      {
        new: true,
        projection: { _id: 1 },
      },
    );

    if (!promotedRide) break;
    promotedRideIds.push(promotedRide._id);
  }

  return { promotedCount: promotedRideIds.length, promotedRideIds };
}

module.exports = {
  FLEXY_CODES,
  PENDING_RIDE_EXPIRY_MS,
  createFlexyRide,
  promoteDueFlexyRides,
};
