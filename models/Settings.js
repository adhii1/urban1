const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    // Singleton pattern - only one settings document
    key: {
      type: String,
      default: 'platform_settings',
      unique: true,
      immutable: true,
    },
    platformName: {
      type: String,
      default: 'TORQQ',
      trim: true,
    },
    maxSeatsPerCab: {
      type: Number,
      default: 6,
      min: 1,
      max: 12,
    },
    autoMatchRadius: {
      type: Number,
      default: 5,
      min: 1,
      max: 50,
    },
    sosAutoDispatch: {
      type: Boolean,
      default: true,
    },
    maintenanceMode: {
      type: Boolean,
      default: false,
    },
    otpExpiryMinutes: {
      type: Number,
      default: 5,
      min: 1,
      max: 30,
    },
    commissionRate: {
      type: Number,
      default: 10,
      min: 0,
      max: 100,
    },
    minFare: {
      type: Number,
      default: 50,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Always return (or create) the single settings document
settingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne({ key: 'platform_settings' });
  if (!settings) {
    settings = await this.create({ key: 'platform_settings' });
  }
  return settings;
};

module.exports = mongoose.model('Settings', settingsSchema);
