
const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema(
  {
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route',
      required: true,
      index: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      index: true,
    },
    tripDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: 'SCHEDULED',
      index: true,
    },
    manifest: [
      {
        customer: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Customer',
          required: true,
        },
        pickupStop: {
          stopName: { type: String },
          sequenceOrder: { type: Number },
          location: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number] },
          },
        },
        dropStop: {
          stopName: { type: String },
          sequenceOrder: { type: Number },
          location: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number] },
          },
        },
        status: {
          type: String,
          enum: ['PENDING', 'BOARDED', 'DROPPED', 'NO_SHOW'],
          default: 'PENDING',
        },
        boardedAt: {
          type: Date,
        },
        droppedAt: {
          type: Date,
        },
      },
    ],
    startedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    cancelReason: {
      type: String,
      trim: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
  },
  {
    timestamps: true,
  }
);

tripSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

tripSchema.pre('findOneAndUpdate', function (next) {
  this.where({ isDeleted: false });
  next();
});

module.exports = mongoose.model('Trip', tripSchema);
