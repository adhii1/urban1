const mongoose = require('mongoose');

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    serviceType: {
      type: String,
      enum: ['Home-to-Office', 'Stop-to-Stop'],
      required: true,
    },
    tier: {
      type: String,
      enum: ['Flexy', 'Hybrid', 'Weekday', 'Standard'],
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    durationDays: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    pauseDaysAllowed: {
      type: Number,
      default: 0,
    },
    features: [{
      type: String,
    }],
    isActive: {
      type: Boolean,
      default: true,
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

planSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

module.exports = mongoose.model('Plan', planSchema);
