const mongoose = require('mongoose');

const corporateJoinRequestSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    corporateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Corporate',
      required: true,
      index: true,
    },
    message: { type: String, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

corporateJoinRequestSchema.index(
  { customerId: 1, corporateId: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } }
);

module.exports = mongoose.model('CorporateJoinRequest', corporateJoinRequestSchema);