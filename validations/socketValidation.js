const Joi = require('joi');

const coordinates = Joi.array().items(Joi.number().min(-180).max(180)).length(2).required();

const location = Joi.object({
  address: Joi.string().trim().min(1).max(500).required(),
  coordinates,
});

const stop = Joi.object({
  address: Joi.string().trim().min(1).max(500).required(),
  coordinates,
  sequenceOrder: Joi.number().integer().min(0).optional(),
});

const rideRequestSchema = Joi.object({
  pickup: location,
  drop: location,
  stops: Joi.array().items(stop).max(10).optional(),
  pickupIntent: Joi.string().valid('IMMEDIATE', 'SCHEDULED').required(),
  scheduledPickupAt: Joi.when('pickupIntent', {
    is: 'SCHEDULED',
    then: Joi.date().iso().greater('now').required(),
    otherwise: Joi.forbidden(),
  }),
});

const rideCancelSchema = Joi.object({
  rideRequestId: Joi.string().hex().length(24).required(),
  reason: Joi.string().trim().max(500).optional().allow(''),
});

const rideAcceptSchema = Joi.object({
  rideRequestId: Joi.string().hex().length(24).required(),
});

const rideHeadToPickupSchema = Joi.object({
  rideRequestId: Joi.string().hex().length(24).required(),
});

const rideRejectSchema = Joi.object({
  rideRequestId: Joi.string().hex().length(24).required(),
});

const verifyOtpSchema = Joi.object({
  rideRequestId: Joi.string().hex().length(24).required(),
  otp: Joi.string().pattern(/^\d{4,6}$/).required(),
});

const rideCompleteSchema = Joi.object({
  rideRequestId: Joi.string().hex().length(24).required(),
});

const driverOnlineSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
});

const driverLocationSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
});

const adminReassignSchema = Joi.object({
  rideRequestId: Joi.string().hex().length(24).required(),
  driverId: Joi.string().hex().length(24).required(),
});

const adminUpdateRideLocationSchema = Joi.object({
  rideRequestId: Joi.string().hex().length(24).required(),
  type: Joi.string().valid('pickup', 'drop').required(),
  address: Joi.string().trim().min(1).max(500).required(),
  coordinates,
});

const adminUpdateDriverLocationSchema = Joi.object({
  driverId: Joi.string().hex().length(24).required(),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
});

const shuttleListingSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  maxResults: Joi.number().integer().min(1).max(50).optional(),
  excludeIds: Joi.array().items(Joi.string().hex().length(24)).optional(),
});

const shuttleAcceptSchema = Joi.object({
  rideRequestIds: Joi.array()
    .items(Joi.string().hex().length(24))
    .min(1)
    .max(6)
    .required(),
});

const shuttlePickupVerifySchema = Joi.object({
  shuttleSessionId: Joi.string().hex().length(24).required(),
  rideRequestId: Joi.string().hex().length(24).required(),
  otp: Joi.string().pattern(/^\d{4,6}$/).required(),
});

const shuttleCompleteDropSchema = Joi.object({
  shuttleSessionId: Joi.string().hex().length(24).required(),
  rideRequestId: Joi.string().hex().length(24).required(),
});

const shuttleNavigateSchema = Joi.object({
  shuttleSessionId: Joi.string().hex().length(24).required(),
});

const shuttleCancelSchema = Joi.object({
  shuttleSessionId: Joi.string().hex().length(24).required(),
  reason: Joi.string().trim().max(500).optional().allow(''),
});

function validateSocketEvent(schema) {
  return (data) => {
    const { error, value } = schema.validate(data, { abortEarly: true, stripUnknown: true });
    if (error) {
      return { valid: false, error: error.details[0].message };
    }
    return { valid: true, value };
  };
}

module.exports = {
  schemas: {
    rideRequest: rideRequestSchema,
    rideCancel: rideCancelSchema,
    rideAccept: rideAcceptSchema,
    rideHeadToPickup: rideHeadToPickupSchema,
    rideReject: rideRejectSchema,
    verifyOtp: verifyOtpSchema,
    rideComplete: rideCompleteSchema,
    driverOnline: driverOnlineSchema,
    driverLocation: driverLocationSchema,
    adminReassign: adminReassignSchema,
    adminUpdateRideLocation: adminUpdateRideLocationSchema,
    adminUpdateDriverLocation: adminUpdateDriverLocationSchema,
    shuttleListing: shuttleListingSchema,
    shuttleAccept: shuttleAcceptSchema,
    shuttlePickupVerify: shuttlePickupVerifySchema,
    shuttleCompleteDrop: shuttleCompleteDropSchema,
    shuttleNavigate: shuttleNavigateSchema,
    shuttleCancel: shuttleCancelSchema,
  },
  validateSocketEvent,
};
