const mongoose = require('mongoose');

const replySchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    senderRole: { type: String, enum: ['Customer', 'Driver', 'Admin'], default: 'Customer' },
    message: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ['RIDE_ISSUE', 'PAYMENT', 'SUBSCRIPTION', 'ACCOUNT', 'SAFETY', 'OTHER'],
      default: 'OTHER',
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
      default: 'OPEN',
      index: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
      default: 'MEDIUM',
    },
    replies: [replySchema],
    resolvedAt: { type: Date },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

supportTicketSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
