const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: true,
    },
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route',
      required: true,
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    remainingPauseDays: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED', 'PENDING_PAYMENT'],
      default: 'PENDING_PAYMENT',
      index: true,
    },
    payment: {
      orderId: { type: String },
      paymentId: { type: String },
      signature: { type: String },
      amount: { type: Number },
      status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending',
      },
      paidAt: { type: Date },
    },
    // ISO weekday values are normalized by the subscription policy service.
    selectedWeekdays: [{
      type: Number,
      min: 0,
      max: 6,
    }],
    bookingsThisWeek: {
      type: Number,
      default: 0,
    },
    weekResetDate: {
      type: Date,
    },

    // Durable managed-stop selections. The sequence copies permit conflict
    // detection even after a route's ordering changes.
    pickupStopId: {
      type: String,
      index: true,
    },
    dropStopId: {
      type: String,
      index: true,
    },
    pickupStopSequence: {
      type: Number,
    },
    dropStopSequence: {
      type: Number,
    },

    // Legacy position fields are deliberately retained for read compatibility
    // while scripts/migrations/backfillDurableStops.js is rolled out.
    pickupStopIndex: {
      type: Number,
    },
    dropStopIndex: {
      type: Number,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// New writes from legacy clients may still carry indexes until all clients
// deploy durable IDs. Resolve them at persistence time without discarding the
// legacy values that older readers require.
subscriptionSchema.pre('validate', async function backfillLegacyStopSelection() {
  const needsPickup = !this.pickupStopId && Number.isInteger(this.pickupStopIndex);
  const needsDrop = !this.dropStopId && Number.isInteger(this.dropStopIndex);
  const needsSequence = this.pickupStopSequence == null || this.dropStopSequence == null;
  if (!this.routeId || (!needsPickup && !needsDrop && !needsSequence)) return;

  const Route = require('./Route');
  const route = await Route.findById(this.routeId).select('stops').lean();
  if (!route) return;
  const pickupStop = route.stops.find((stop) => stop.stopId === this.pickupStopId)
    || route.stops[this.pickupStopIndex];
  const dropStop = route.stops.find((stop) => stop.stopId === this.dropStopId)
    || route.stops[this.dropStopIndex];

  if (pickupStop) {
    this.pickupStopId ||= pickupStop.stopId;
    this.pickupStopSequence ??= pickupStop.sequenceOrder;
  }
  if (dropStop) {
    this.dropStopId ||= dropStop.stopId;
    this.dropStopSequence ??= dropStop.sequenceOrder;
  }
});

subscriptionSchema.pre(/^find/, function excludeDeleted(next) {
  this.where({ isDeleted: false });
  next();
});

subscriptionSchema.index({ routeId: 1, status: 1, isDeleted: 1 });
subscriptionSchema.index({ routeId: 1, pickupStopId: 1, dropStopId: 1, isDeleted: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
