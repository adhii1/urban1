const mongoose = require('mongoose');

/**
 * Corporate — a company account that manages a roster of employee commuters.
 * Analogous to Customer/Driver/Admin: one User (role: 'Corporate') maps to one
 * Corporate profile. Employees are ordinary Customer accounts linked back via
 * Customer.corporateId, so the rest of the platform (subscriptions, trips,
 * wallet) needs no special-casing for them.
 */
const corporateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
    },
    contactPerson: {
      name: { type: String, trim: true },
      designation: { type: String, trim: true },
    },
    billingEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    gstNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },
    address: {
      type: String,
      trim: true,
    },
    // How many employee (Customer) accounts this corporate account may have.
    // Admin-set at provisioning time; the self-service "Add Employee" flow
    // enforces this so a company can't onboard past what was agreed.
    employeeLimit: {
      type: Number,
      default: 50,
      min: 1,
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
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

corporateSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

module.exports = mongoose.model('Corporate', corporateSchema);
