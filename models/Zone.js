const mongoose = require('mongoose');

/**
 * Zone — a scalable grouping layer above Areas.
 *
 * Hierarchy: Zone → many Areas → pickups fall inside an Area.
 * Drivers belong to a Zone, so a single driver serves every Area in their Zone.
 *
 * Example:
 *   Zone 1 (South Bengaluru) → HSR, BTM, Koramangala, ...
 *   Zone 2 (East Bengaluru)  → Whitefield, Marathahalli, ...
 */
const zoneSchema = new mongoose.Schema(
  {
    // Human-friendly zone code, e.g. "Z1", "Z2" — auto-generated if omitted.
    code: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
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

zoneSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

module.exports = mongoose.model('Zone', zoneSchema);
