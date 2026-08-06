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

    // --- Booking Rules ---
    // Flexi: single-person booking (like Ola/Uber), must book 2 hours in advance
    // Hybrid: can only book 3 days per week (customer picks which days)
    // Weekday: Mon-Fri only (5 days)
    // Standard: all days, managed shuttle with multiple customers per trip
    bookingRules: {
      // Max passengers per booking (Flexi = 1, others = multiple/shared)
      maxPassengersPerBooking: {
        type: Number,
        default: 1,
      },
      // Minimum advance booking time in minutes (Flexi = 120 = 2 hours)
      minAdvanceBookingMinutes: {
        type: Number,
        default: 0,
      },
      // Allowed days per week (Hybrid = 3, Weekday = 5, Standard/Flexi = 7)
      allowedDaysPerWeek: {
        type: Number,
        default: 7,
      },
      // Specific allowed weekdays (0=Sun, 1=Mon...6=Sat)
      // Weekday: [1,2,3,4,5], Hybrid: customer picks any 3, Standard/Flexi: [0,1,2,3,4,5,6]
      allowedWeekdays: [{
        type: Number,
        min: 0,
        max: 6,
      }],
      // Alternative days mode (every other day booking)
      isAlternateDay: {
        type: Boolean,
        default: false,
      },
      // Whether this is a shared/managed ride (multiple customers picked up)
      // Flexi = false (single person, like Ola/Uber)
      // Standard/Hybrid/Weekday = true (bus stops, multiple customers)
      isSharedRide: {
        type: Boolean,
        default: true,
      },
      // Whether route stops (bus stops) are managed by admin for pickup/drop
      useManagedStops: {
        type: Boolean,
        default: true,
      },
    },

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
