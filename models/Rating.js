const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  rideId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RideRequest',
    required: true,
    unique: true,
    index: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: true,
    index: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    maxlength: 500,
    trim: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for efficient queries
ratingSchema.index({ driverId: 1, createdAt: -1 });
ratingSchema.index({ customerId: 1, createdAt: -1 });

// Filter out soft-deleted ratings
ratingSchema.pre(/^find/, function(next) {
  this.where({ isDeleted: false });
  next();
});

// Calculate average rating for a driver
ratingSchema.statics.calculateAverageRating = async function(driverId) {
  const stats = await this.aggregate([
    { $match: { driverId: driverId, isDeleted: false } },
    {
      $group: {
        _id: '$driverId',
        averageRating: { $avg: '$rating' },
        totalRatings: { $sum: 1 }
      }
    }
  ]);

  if (stats.length > 0) {
    return {
      average: Math.round(stats[0].averageRating * 10) / 10,
      count: stats[0].totalRatings
    };
  }
  return { average: 0, count: 0 };
};

module.exports = mongoose.model('Rating', ratingSchema);
