const crypto = require('crypto');
const mongoose = require('mongoose');

const stopSchema = new mongoose.Schema(
  {
    // This identifier belongs to the route stop, rather than the array position.
    // It remains stable when administrators reorder stops.
    stopId: {
      type: String,
      required: true,
      immutable: true,
      default: () => crypto.randomUUID(),
    },
    stopName: {
      type: String,
      required: true,
    },
    sequenceOrder: {
      type: Number,
      required: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
  },
  { _id: false }
);

const routeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    startLocation: {
      type: String,
      required: true,
    },
    endLocation: {
      type: String,
      required: true,
    },
    stops: [stopSchema],
    assignedDriver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      index: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
      index: true,
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

routeSchema.pre('validate', function validateStableStops(next) {
  const stopIds = new Set();
  const sequenceOrders = new Set();

  for (const stop of this.stops || []) {
    if (!stop.stopId || stopIds.has(stop.stopId)) {
      this.invalidate('stops', 'Every route stop must have a unique stable stopId.');
      break;
    }
    stopIds.add(stop.stopId);

    if (sequenceOrders.has(stop.sequenceOrder)) {
      this.invalidate('stops', 'Every route stop must have a unique sequenceOrder.');
      break;
    }
    sequenceOrders.add(stop.sequenceOrder);
  }
  next();
});

routeSchema.pre(/^find/, function excludeDeleted(next) {
  this.where({ isDeleted: false });
  next();
});

routeSchema.pre('findOneAndUpdate', function excludeDeletedFromUpdates(next) {
  this.where({ isDeleted: false });
  next();
});

routeSchema.index({ 'stops.location': '2dsphere' });
routeSchema.index({ status: 1, isDeleted: 1 });

module.exports = mongoose.model('Route', routeSchema);
