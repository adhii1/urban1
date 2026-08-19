const Joi = require('joi');

const purchaseSubscription = Joi.object({
  planId: Joi.string().hex().length(24).required(),
  routeId: Joi.string().hex().length(24).required(),
  startDate: Joi.date().iso().required(),
  // Calendar and managed-stop policy is intentionally evaluated by the
  // subscription policy service after the plan and route are resolved.
  selectedWeekdays: Joi.array().items(Joi.number().integer()).optional(),
  pickupStopId: Joi.string().trim().min(1).max(200).optional(),
  dropStopId: Joi.string().trim().min(1).max(200).optional(),
  // Legacy clients can provide indexes during the durable-stop rollout. The
  // policy resolves and persists the canonical IDs and sequence snapshots.
  pickupStopIndex: Joi.number().integer().min(0).optional(),
  dropStopIndex: Joi.number().integer().min(0).optional(),
});

module.exports = { purchaseSubscription };
