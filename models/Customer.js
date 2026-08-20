
const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
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
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      index: true,
    },
    homeLocation: {
      address: { type: String, trim: true },
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    pickupLocation: {
      address: { type: String, trim: true },
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    dropLocation: {
      address: { type: String, trim: true },
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'BANNED'],
      default: 'ACTIVE',
      index: true,
    },
    // Customer preferences/settings
    settings: {
      notifications: { type: Boolean, default: true },
      rideAlerts: { type: Boolean, default: true },
      promoEmails: { type: Boolean, default: false },
      language: { type: String, default: 'en' },
      darkMode: { type: Boolean, default: false },
    },
    // Wallet balance (in INR)
    walletBalance: {
      type: Number,
      default: 0,
      min: 0,
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

customerSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

customerSchema.pre('findOneAndUpdate', function (next) {
  this.where({ isDeleted: false });
  next();
});

customerSchema.index({ pickupLocation: '2dsphere' });
customerSchema.index({ dropLocation: '2dsphere' });

module.exports = mongoose.model('Customer', customerSchema);
