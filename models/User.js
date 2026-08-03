
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      unique: true,
      trim: true,
      index: true,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    hasCustomPassword: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ['Admin', 'Driver', 'Customer'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
      default: 'ACTIVE',
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    pushSubscriptions: [
      {
        subscription: {
          type: Object,
          required: true,
        },
        subscribedAt: { type: Date, default: Date.now },
        userAgent: { type: String },
      },
    ],
  },
  {
    timestamps: true,
  }
);

userSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

userSchema.pre('findOneAndUpdate', function (next) {
  this.where({ isDeleted: false });
  next();
});

// Add email field for optional email notifications
userSchema.add({
  email: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true,
    index: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
  },
});

module.exports = mongoose.model('User', userSchema);
