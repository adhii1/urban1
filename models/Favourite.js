const mongoose = require('mongoose');

const favouriteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    icon: {
      type: String,
      default: 'map-pin',
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

favouriteSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

favouriteSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Favourite', favouriteSchema);
