const mongoose = require('mongoose');

/**
 * Trip model — Per PDF sections 9-12, 17:
 * A Trip is a single daily service run for a driver with multiple passengers.
 * The manifest lists each passenger with their pickup/drop coordinates and OTP.
 * Route order is calculated by geographic proximity, not booking order.
 *
 * Two generations of trip coexist here, and both are live:
 *   - area-based  — keyed { driverId, serviceDate, pickupTime }, riders in
 *     `passengers`. This is what subscriptions produce (services/DailyTripGenerator).
 *   - route-based — keyed { routeId, serviceDate }, riders in `manifest`. Still
 *     reached through the admin recovery-generation and route-reconciliation
 *     endpoints (services/tripGenerator, services/routeReconciliationService).
 * Fields that look vestigial are usually the route-based half; check both
 * writers before removing one.
 */

const stopSnapshotSchema = new mongoose.Schema(
  {
    stopId: { type: String },
    stopName: { type: String },
    sequenceOrder: { type: Number },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number] },
    },
  },
  { _id: false }
);

const manifestConflictSchema = new mongoose.Schema(
  {
    state: {
      type: String,
      enum: ['NONE', 'REQUIRES_RESOLUTION'],
      default: 'NONE',
    },
    reason: { type: String, trim: true },
    detectedAt: { type: Date },
  },
  { _id: false }
);

const manifestEntrySchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      index: true,
    },
    pickupStop: stopSnapshotSchema,
    dropStop: stopSnapshotSchema,
    status: {
      type: String,
      enum: ['PENDING', 'BOARDED', 'DROPPED', 'NO_SHOW'],
      default: 'PENDING',
    },
    conflict: {
      type: manifestConflictSchema,
      default: () => ({ state: 'NONE' }),
    },
    boardedAt: { type: Date },
    droppedAt: { type: Date },
  },
  { _id: true }
);

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
    // The driver assigned to this trip.
    //
    // Optional, not required: a route-based trip is created before its driver is
    // resolved (services/tripGenerator.js) and an admin can unassign a driver
    // from future trips (routeReconciliationService.applyDriverChange). With
    // `required: true` both of those paths threw ValidationError and no
    // route-based trip could be generated at all.
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
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
    // Planned departure day, kept for the route-based API responses that still
    // read it. serviceDate is derived from it when only this is supplied — see
    // the normalizing hook below.
    tripDate: { type: Date },
    // Legacy manifest field — riders on a route-based trip. Typed rather than
    // Mixed so `conflict.state` defaults and the stop snapshots validate;
    // routeReconciliationService reads entry.conflict.state to decide whether an
    // admin still needs to resolve a route change.
    manifest: [manifestEntrySchema],

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

tripSchema.pre('validate', function deriveServiceDate(next) {
  // serviceDate is the normalized calendar day every trip is keyed on, but the
  // route-based writers (admin createTrip, utils/geoHelper manifests) only supply
  // tripDate. Deriving it here rather than requiring both keeps a single source
  // of truth: before this, admin trip creation failed validation outright.
  if (!this.serviceDate && this.tripDate) {
    const normalized = new Date(this.tripDate);
    normalized.setHours(0, 0, 0, 0);
    this.serviceDate = normalized;
  }
  next();
});

tripSchema.pre(/^find/, function excludeDeleted(next) {
  this.where({ isDeleted: false });
  next();
});

tripSchema.pre('findOneAndUpdate', function excludeDeleted(next) {
  this.where({ isDeleted: false });
  next();
});

// One trip per driver per service date PER PICKUP TIME.
//
// pickupTime is part of a trip's identity, not a label on it: a driver can run
// an 08:00 commute and an 18:00 return on the same day, and those are different
// people in the vehicle at different times. Keyed on { driverId, serviceDate }
// alone, the second run collided with the first and its passengers were merged
// into the first trip's manifest — so a customer holding a morning and an
// evening subscription got one ride, at the morning time.
//
// Adding a field only widens a unique key, so this cannot fail to build on data
// that satisfied the old index. The old one is dropped in config/database.js;
// left in place it would still reject the second run.
//
// `driverId: { $type: 'objectId' }` scopes this to trips that actually have a
// driver. A route-based trip is inserted with `driverId: null` before its driver
// is resolved, and applyDriverChange sets null to unassign; without this
// predicate every driverless trip on a date would key as { null, date, null }
// and the second would fail with E11000. `$type` rather than `$exists: true`
// because $exists matches a field that is present and null, which is exactly
// the case here.
tripSchema.index(
  { driverId: 1, serviceDate: 1, pickupTime: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false, driverId: { $type: 'objectId' } },
    name: 'driver_service_slot_unique',
  }
);
tripSchema.index({ 'passengers.subscriptionId': 1, serviceDate: 1, isDeleted: 1 });
tripSchema.index({ 'passengers.customerId': 1, serviceDate: 1, isDeleted: 1 });

// One route-based trip per route per service date. This is the idempotency key
// services/tripGenerator relies on: concurrent recovery runs race to insert the
// same route/date and the loser recovers via the E11000 path.
//
// `routeId: { $type: 'objectId' }` is essential and NOT in the filter this
// replaced. Area-based trips carry no routeId, so under the old filter every one
// of them indexed at routeId: null — meaning two different drivers working the
// same date collided with a duplicate-key error. Scoping to documents that
// actually have a routeId keeps the two trip generations out of one key space.
tripSchema.index(
  { routeId: 1, serviceDate: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
      routeId: { $type: 'objectId' },
      serviceDate: { $exists: true },
    },
    name: 'unique_active_route_service_date',
  }
);
tripSchema.index({ 'manifest.subscriptionId': 1, serviceDate: 1, isDeleted: 1 });

module.exports = mongoose.model('Trip', tripSchema);
