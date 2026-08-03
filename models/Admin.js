// Export Mongoose models

const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    permissions: [
      {
        type: String, // e.g., 'MANAGE_DRIVERS', 'MANAGE_SETTINGS', 'APPROVE_PAYOUTS'
      },
    ],
    role: {
      type: String,
      enum: ['Super Admin', 'Operations Admin', 'Support Admin', 'Finance Admin'],
      default: 'Super Admin',
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
  {
    timestamps: true,
  }
);

adminSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

module.exports = mongoose.model('Admin', adminSchema);
