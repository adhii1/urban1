const mongoose = require('mongoose');

/**
 * Subscription model — Per the PDF spec:
 * - Customer subscribes with type HYBRID or WEEKDAYS (or FLEXY for on-demand)
 * - Stores pickup/drop as GeoJSON coordinates (not route stop references)
 * - Stores selected schedule days
 * - Backend uses this to generate daily trips and match drivers
 */
const subscriptionSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: true,
    },

    // --- Subscription Type (per PDF section 5) ---
    // WEEKDAYS = Mon-Fri, HYBRID = customer-selected days (e.g. MWF),
    // SHUTTLE = fixed-route Stop-to-Stop (Standard tier). FLEXY is retained only
    // for legacy rows; on-demand Flexy rides are RideRequests, not subscriptions.
    subscriptionType: {
      type: String,
      enum: ['WEEKDAYS', 'HYBRID', 'SHUTTLE', 'FLEXY'],
      required: true,
      index: true,
    },

    // --- Schedule Days (per PDF section 5) ---
    // ISO weekday values: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    // WEEKDAYS: auto-set to [1,2,3,4,5]
    // HYBRID: customer picks their days (e.g. [1,3,5] for Mon/Wed/Fri)
    scheduleDays: [{
      type: Number,
      min: 0,
      max: 6,
    }],

    // --- Locations (per PDF section 6) ---
    // Customer's actual pickup/drop coordinates — NOT route stop references.
    // The matching engine uses these coordinates to find area + driver.
    pickupLocation: {
      address: { type: String, trim: true },
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    dropLocation: {
      address: { type: String, trim: true },
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },

    // --- Pickup Time (per PDF section 6) ---
    // e.g. "08:00" — the time the customer wants to be picked up daily
    pickupTime: {
      type: String,
      required: true,
      trim: true,
    },

    // --- Assignment (set by matching engine) ---
    assignedDriverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      index: true,
    },
    assignedAreaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Area',
      index: true,
    },

    // --- Dates ---
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },

    // --- Status (per PDF section 23) ---
    status: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED', 'EXPIRED', 'PENDING_PAYMENT'],
      default: 'PENDING',
      index: true,
    },

    // --- "Current" marker ---
    // `true` while a subscription is live (ACTIVE, PAUSED or PENDING_PAYMENT),
    // `false` once it reaches CANCELLED/COMPLETED/EXPIRED. A customer may hold
    // as many current subscriptions as they like — one per commute. The flag is
    // the predicate for the schedule-clash index below.
    isCurrent: {
      type: Boolean,
    },

    remainingPauseDays: {
      type: Number,
      default: 0,
    },

    // --- Hybrid weekly booking cap (per PDF section 5) ---
    // Reset weekly by subscriptionExpiryService; read by checkBookingEligibility.
    bookingsThisWeek: {
      type: Number,
      default: 0,
    },
    weekResetDate: {
      type: Date,
    },

    // --- Payment ---
    payment: {
      // How the subscription was paid for. 'wallet' = instant debit from the
      // customer wallet; 'razorpay' = order->verify checkout; 'instant' = dev/
      // demo activation with no charge.
      method: {
        type: String,
        enum: ['wallet', 'razorpay', 'instant'],
      },
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

    // --- Legacy route-based fields (retained for backward compat) ---
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route',
      index: true,
    },
    pickupStopId: { type: String },
    dropStopId: { type: String },
    // The sequence copies let conflict detection tell "the route was reordered"
    // apart from "my stop was removed" after a route's ordering changes.
    //
    // These must stay declared even though area-based subscriptions never set
    // them: routeReconciliationService.resolveManifestConflict assigns
    // pickupStopSequence/dropStopSequence when an admin resolves a route-change
    // conflict, and Mongoose silently drops writes to undeclared paths. Without
    // them the resolution appeared to succeed and saved nothing.
    pickupStopSequence: { type: Number },
    dropStopSequence: { type: Number },
    // Positional fallbacks, read by durableStopMigrationService when a
    // subscription predates stable stop IDs.
    pickupStopIndex: { type: Number },
    dropStopIndex: { type: Number },
    selectedWeekdays: [{ type: Number, min: 0, max: 6 }],

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

subscriptionSchema.pre(/^find/, function excludeDeleted(next) {
  this.where({ isDeleted: false });
  next();
});

subscriptionSchema.index({ pickupLocation: '2dsphere' });
subscriptionSchema.index({ dropLocation: '2dsphere' });
subscriptionSchema.index({ customerId: 1, isDeleted: 1 });
subscriptionSchema.index({ customerId: 1, isCurrent: 1 });
subscriptionSchema.index({ status: 1, subscriptionType: 1, isDeleted: 1 });
subscriptionSchema.index({ assignedDriverId: 1, status: 1 });

// A customer may hold any number of concurrent subscriptions — a weekday
// commute at 08:00, an evening run at 18:00, a Saturday shuttle. What they
// cannot hold is two that collide: you can only be picked up once at 08:00 on a
// given Monday.
//
// `scheduleDays` is an array, so this is a *multikey* index: MongoDB stores one
// entry per day, and the unique constraint applies per entry. Two subscriptions
// at the same pickupTime conflict only if they actually share a day —
// [1,2,3,4,5] vs [3,4,5] collides on 3, while [1,2,3] vs [4,5] is fine.
// Duplicate values inside a single document are collapsed, so [1,1,2] is legal.
//
// This is the authoritative concurrency guard: it makes a double-submit or two
// racing requests fail atomically in the database rather than depending on a
// read-then-write check in the service. `findConflictingSubscription` in
// services/subscriptionService.js produces the friendly message for the same
// condition; this index is what actually enforces it.
subscriptionSchema.index(
  { customerId: 1, pickupTime: 1, scheduleDays: 1 },
  {
    name: 'customer_schedule_slot_unique',
    unique: true,
    partialFilterExpression: { isCurrent: true },
  }
);

module.exports = mongoose.model('Subscription', subscriptionSchema);
