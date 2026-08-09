const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      trim: true,
      default: '',
    },
    type: {
      type: String,
      enum: ['RIDE', 'SUBSCRIPTION', 'PAYMENT', 'PROMO', 'SYSTEM', 'ALERT'],
      default: 'SYSTEM',
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

notificationSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
