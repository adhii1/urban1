const mongoose = require('mongoose');

const resolutionSchema = new mongoose.Schema(
  {
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    notes: { type: String, trim: true },
    pickupStopId: { type: String },
    dropStopId: { type: String },
  },
  { _id: false }
);

const operationalExceptionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'UNASSIGNED_DRIVER',
        'DRIVER_ASSIGNMENT_FAILED',
        'ROUTE_CHANGE_CONFLICT',
        'TRIP_GENERATION_FAILED',
      ],
      required: true,
      index: true,
    },
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', index: true },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', index: true },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', index: true },
    serviceDate: { type: Date, required: true, index: true },
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['OPEN', 'RESOLVED', 'DISMISSED'],
      default: 'OPEN',
      index: true,
    },
    resolution: { type: resolutionSchema, default: () => ({}) },
  },
  { timestamps: true }
);

operationalExceptionSchema.index({ status: 1, serviceDate: 1 });
operationalExceptionSchema.index({ routeId: 1, serviceDate: 1, status: 1 });
operationalExceptionSchema.index({ tripId: 1, subscriptionId: 1, status: 1 });

module.exports = mongoose.model('OperationalException', operationalExceptionSchema);
