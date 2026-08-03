
const mongoose = require('mongoose');

const pauseRequestSchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },
    requestedDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
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

pauseRequestSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

pauseRequestSchema.pre('findOneAndUpdate', function (next) {
  this.where({ isDeleted: false });
  next();
});

module.exports = mongoose.model('PauseRequest', pauseRequestSchema);
