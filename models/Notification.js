
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
    },
    channels: [
      {
        type: String,
        enum: ['PUSH', 'SMS', 'EMAIL'],
      },
    ],
    targetRole: {
      type: String,
      enum: ['ALL', 'Admin', 'Driver', 'Customer'],
      default: 'ALL',
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    readStatus: {
      type: String,
      enum: ['UNREAD', 'READ'],
      default: 'UNREAD',
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'SENT', 'FAILED'],
      default: 'SENT',
      index: true,
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

notificationSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

notificationSchema.pre('findOneAndUpdate', function (next) {
  this.where({ isDeleted: false });
  next();
});

module.exports = mongoose.model('Notification', notificationSchema);
