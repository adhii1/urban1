const mongoose = require('mongoose');

/**
 * SosAlert — a record of an emergency trigger fired from a customer's active
 * subscription/trip. Emergency Mode lives on the Subscription (armed per
 * commute); this is the append-only log of actual triggers, surfaced to the
 * admin console the same way other customer operations are.
 */
const sosAlertSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      index: true,
    },
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      index: true,
    },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number] }, // [lng, lat]
    },
    status: {
      type: String,
      enum: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'],
      default: 'OPEN',
      index: true,
    },
    notifiedContacts: {
      type: Number,
      default: 0,
    },
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

sosAlertSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

sosAlertSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('SosAlert', sosAlertSchema);
