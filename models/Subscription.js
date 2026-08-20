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
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: true,
    },

    // --- Subscription Type (per PDF section 5) ---
    // WEEKDAYS = Mon-Fri, HYBRID = customer-selected days (e.g. MWF)
    subscriptionType: {
      type: String,
      enum: ['WEEKDAYS', 'HYBRID', 'FLEXY'],
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
      enum: ['PENDING', 'ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED', 'PENDING_PAYMENT'],
      default: 'PENDING',
      index: true,
    },

    remainingPauseDays: {
      type: Number,
      default: 0,
    },

    // --- Payment ---
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

    // --- Legacy route-based fields (retained for backward compat) ---
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route',
      index: true,
    },
    pickupStopId: { type: String },
    dropStopId: { type: String },
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
subscriptionSchema.index({ status: 1, subscriptionType: 1, isDeleted: 1 });
subscriptionSchema.index({ assignedDriverId: 1, status: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
