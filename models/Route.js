
const mongoose = require('mongoose');

const stopSchema = new mongoose.Schema(
  {
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

routeSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

routeSchema.pre('findOneAndUpdate', function (next) {
  this.where({ isDeleted: false });
  next();
});

routeSchema.index({ 'stops.location': '2dsphere' });

module.exports = mongoose.model('Route', routeSchema);
