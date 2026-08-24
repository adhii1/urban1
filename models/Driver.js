
const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    vehicleNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    vehicleModel: {
      type: String,
      required: true,
      trim: true,
    },
    vehicleCapacity: {
      type: Number,
      required: true,
      default: 6,
      max: 6,
    },
    // Number of ACTIVE subscriptions currently assigned to this driver. Used as
    // the atomic capacity guard: assignment reserves a seat only while this is
    // below vehicleCapacity, so concurrent bookings can't over-assign a driver.
    activeSubscriptionCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    licenseNumber: {
      type: String,
      required: true,
      trim: true,
    },
    documents: {
      license: {
        url: { type: String },
        verified: { type: Boolean, default: false },
        verifiedAt: { type: Date },
        uploadedAt: { type: Date },
      },
      vehicleRC: {
        url: { type: String },
        verified: { type: Boolean, default: false },
        verifiedAt: { type: Date },
        uploadedAt: { type: Date },
      },
      insurance: {
        url: { type: String },
        verified: { type: Boolean, default: false },
        verifiedAt: { type: Date },
        uploadedAt: { type: Date },
        expiryDate: { type: Date },
      },
    },
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route',
      index: true,
    },
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Area',
      index: true,
    },
    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0],
      },
    },
    isOnline: {
      type: Boolean,
      default: false,
      index: true,
    },
    isAvailable: {
      type: Boolean,
      default: false,
      index: true,
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalRatings: {
      type: Number,
      default: 0,
    },
    cancellationCount: {
      type: Number,
      default: 0,
    },
    lastCancellationAt: {
      type: Date,
    },
    suspensionUntil: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_APPROVAL'],
      default: 'PENDING_APPROVAL',
      index: true,
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

driverSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

driverSchema.pre('findOneAndUpdate', function (next) {
  this.where({ isDeleted: false });
  next();
});

// Single 2dsphere index for $near queries; compound index for
// $geoWithin/$geoIntersects queries that also filter by availability.
driverSchema.index({ currentLocation: '2dsphere' });
driverSchema.index({ isOnline: 1, isAvailable: 1, currentLocation: '2dsphere' });

module.exports = mongoose.model('Driver', driverSchema);
