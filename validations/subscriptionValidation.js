const Joi = require('joi');

// Unified coordinate-model purchase (Razorpay entry). Mirrors the /book body;
// the server forces paymentMethod = 'razorpay' for this endpoint.
const locationSchema = Joi.object({
  address: Joi.string().allow('').optional(),
  coordinates: Joi.array().items(Joi.number()).length(2).required(),
}).unknown(true);

const purchaseSubscription = Joi.object({
  subscriptionType: Joi.string().valid('WEEKDAYS', 'HYBRID', 'SHUTTLE').required(),
  pickupLocation: locationSchema.required(),
  dropLocation: locationSchema.required(),
  // WEEKDAYS/SHUTTLE ignore this (Mon–Fri auto); HYBRID picks 1–3 days.
  scheduleDays: Joi.array().items(Joi.number().integer().min(0).max(6)).optional(),
  pickupTime: Joi.string().trim().required(),
  startDate: Joi.date().iso().optional(),
  // Accepted for a unified body shape with /book; this endpoint always uses Razorpay.
  paymentMethod: Joi.string().valid('wallet', 'razorpay', 'instant').optional(),
});

module.exports = { purchaseSubscription };
