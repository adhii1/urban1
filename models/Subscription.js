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

    // --- Payment tracking ---
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

    // --- Booking schedule (for Hybrid plans - customer picks days) ---
    // Which weekdays (0-6) the customer has chosen for Hybrid plans
    selectedWeekdays: [{
      type: Number,
      min: 0,
      max: 6,
    }],

    // Track days used this week (reset weekly) for hybrid/alternate plans
    bookingsThisWeek: {
      type: Number,
      default: 0,
    },
    weekResetDate: {
      type: Date,
    },

    // Pickup/drop stop selection for managed routes
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

subscriptionSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

module.exports = mongoose.model('Subscription', subscriptionSchema);
