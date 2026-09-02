const mongoose = require('mongoose');

const areaSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    // Center point for simple radius-based containment checks.
    center: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    // Service radius in kilometers from center.
    radiusKm: {
      type: Number,
      required: true,
      min: 0.5,
      max: 50,
      default: 5,
    },
    // The zone this area belongs to. Drivers are assigned per-zone, so a zone
    // groups many areas for scalable dispatch. Optional for backward compat.
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Zone',
      index: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

areaSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

areaSchema.index({ center: '2dsphere' });

module.exports = mongoose.model('Area', areaSchema);
