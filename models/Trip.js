const mongoose = require('mongoose');

/**
 * Trip model — Per PDF sections 9-12, 17:
 * A Trip is a single daily service run for a driver with multiple passengers.
 * The manifest lists each passenger with their pickup/drop coordinates and OTP.
 * Route order is calculated by geographic proximity, not booking order.
 */

const passengerSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      index: true,
    },
    // Customer's pickup/drop for this trip (snapshot from subscription)
    pickupLocation: {
      address: { type: String, trim: true },
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number] }, // [lng, lat]
    },
    dropLocation: {
      address: { type: String, trim: true },
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number] }, // [lng, lat]
    },
    // Optimized pickup sequence order (set by route optimizer, not booking order)
    pickupOrder: { type: Number },

    // Per-passenger OTP (per PDF section 15)
    otp: {
      code: { type: String },
      verified: { type: Boolean, default: false },
    },

    // Per-passenger ride status (per PDF section 23)
    status: {
      type: String,
      enum: [
        'ASSIGNED',          // Passenger added to trip
        'DRIVER_EN_ROUTE',   // Driver heading to this passenger
        'DRIVER_ARRIVED',    // Driver at pickup, waiting for OTP
        'OTP_VERIFIED',      // OTP verified
        'RIDE_STARTED',      // Customer boarded, ride in progress
        'DROPPING_OFF',      // Approaching drop location
        'COMPLETED',         // Dropped off successfully
        'NO_SHOW',           // Customer didn't show up
      ],
      default: 'ASSIGNED',
    },
    boardedAt: { type: Date },
    droppedAt: { type: Date },
  },
  { _id: true }
);

const tripSchema = new mongoose.Schema(
  {
    // The driver assigned to this trip
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      index: true,
    },
    // The area this trip belongs to
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Area',
      index: true,
    },

    // The service date (normalized to midnight)
    serviceDate: {
      type: Date,
      required: true,
      index: true,
    },
    // Planned pickup start time (e.g. 8:00 AM)
    pickupTime: {
      type: String,
      trim: true,
    },

    // Trip-level status (per PDF section 23)
    status: {
      type: String,
      enum: ['SCHEDULED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: 'SCHEDULED',
      index: true,
    },

    // Assignment status for the driver (per PDF section 10)
    assignmentStatus: {
      type: String,
      enum: ['PENDING', 'OFFERED', 'ACCEPTED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },

    // Passengers manifest — the pooled customers for this trip
    passengers: [passengerSchema],

    // Google Maps navigation URL with ordered stops
    navigationUrl: { type: String },

    // Lifecycle timestamps
    offeredAt: { type: Date },
    acceptedAt: { type: Date },
    rejectedAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
    cancelReason: { type: String, trim: true },

    // Legacy route-based field (for backward compat with old trips)
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route',
      index: true,
    },
    // Legacy manifest field
    manifest: { type: mongoose.Schema.Types.Mixed },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: { type: Date },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
  },
  {
    timestamps: true,
  }
);

tripSchema.pre(/^find/, function excludeDeleted(next) {
  this.where({ isDeleted: false });
  next();
});

tripSchema.pre('findOneAndUpdate', function excludeDeleted(next) {
  this.where({ isDeleted: false });
  next();
});

// One trip per driver per service date
tripSchema.index(
  { driverId: 1, serviceDate: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);
tripSchema.index({ 'passengers.subscriptionId': 1, serviceDate: 1, isDeleted: 1 });
tripSchema.index({ 'passengers.customerId': 1, serviceDate: 1, isDeleted: 1 });

module.exports = mongoose.model('Trip', tripSchema);
