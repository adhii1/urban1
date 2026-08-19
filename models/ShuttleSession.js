const mongoose = require('mongoose');

const shuttleSessionSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      index: true,
    },
    rideRequestIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RideRequest',
      },
    ],
    status: {
      type: String,
      enum: ['PENDING', 'DISPATCHED', 'ACCEPTED', 'ARRIVING', 'PICKUP_IN_PROGRESS', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    sequence: [
      {
        type: {
          type: String,
          enum: ['PICKUP', 'DROP'],
          required: true,
        },
        rideRequestId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'RideRequest',
          required: true,
        },
        customerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        customerName: {
          type: String,
          trim: true,
        },
        location: {
          address: { type: String, required: true, trim: true },
          type: { type: String, enum: ['Point'], default: 'Point' },
          coordinates: { type: [Number], required: true },
        },
        status: {
          type: String,
          enum: ['PENDING', 'COMPLETED'],
          default: 'PENDING',
        },
        // Pickup and drop sequence entries retain their execution state;
        // RideRequest.passengerLifecycle is the authoritative passenger state.
        passengerLifecycle: {
          type: String,
          enum: ['PENDING', 'BOARDED', 'DROPPED'],
          default: 'PENDING',
        },
        completedAt: { type: Date },
        otpVerified: { type: Boolean, default: false },
        sequenceOrder: { type: Number },
      },
    ],
    navigationUrl: { type: String },
    totalRides: { type: Number, default: 0 },
    completedRides: { type: Number, default: 0 },
    completedAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

shuttleSessionSchema.index({ driverId: 1, status: 1 });

shuttleSessionSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

shuttleSessionSchema.pre('findOneAndUpdate', function (next) {
  this.where({ isDeleted: false });
  next();
});

module.exports = mongoose.model('ShuttleSession', shuttleSessionSchema);