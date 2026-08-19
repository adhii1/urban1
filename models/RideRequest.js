
const mongoose = require('mongoose');

const rideRequestSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Denormalized customer info at ride-creation time. Stored on the
    // ride so admin/customer views don't need a separate Customer lookup.
    customerName: { type: String, trim: true },
    customerPhone: { type: String, trim: true },
    pickupLocation: {
      address: { type: String, required: true, trim: true },
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    dropLocation: {
      address: { type: String, required: true, trim: true },
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    stops: [
      {
        address: { type: String, trim: true },
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number] },
        sequenceOrder: { type: Number },
      },
    ],
    status: {
      type: String,
      enum: [
        'PENDING',        // Searching for drivers
        'SCHEDULED',      // Booked in advance, waiting to dispatch
        'ACCEPTED',       // Driver accepted
        'RESERVED',       // Part of a bundle that has been accepted
        'DRIVER_ARRIVING', // Driver en route to pickup
        'IN_PROGRESS',    // Customer picked up, trip ongoing
        'COMPLETED',      // Trip finished
        'CANCELLED',      // Cancelled by customer or driver
        'EXPIRED',        // No driver accepted within timeout
      ],
      default: 'PENDING',
      index: true,
    },
    matchedDrivers: [
      {
        driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
        distanceKm: { type: Number },
        notifiedAt: { type: Date, default: Date.now },
        respondedAt: { type: Date },
        response: { type: String, enum: ['ACCEPTED', 'REJECTED', 'IGNORED'] },
      },
    ],
    acceptedDriverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      index: true,
    },
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
    },
    // Links this ride to the ShuttleSession that owns it once a driver has
    // accepted a bundle (single or multi-passenger). Absence of this field
    // means the ride is either still PENDING or was completed/cancelled
    // before ever being bundled.
    //
    // CRITICAL: this field was previously used throughout the codebase
    // (shuttleService.js, driverEvents.js, customerEvents.js) via
    // $set/$unset in RideRequest.updateMany/findOneAndUpdate calls, but was
    // never declared on the schema. Mongoose's default strict mode silently
    // strips unknown paths from update operations, so shuttleSessionId was
    // NEVER actually persisted to the database. Every downstream read of
    // `rideRequest.shuttleSessionId` (e.g. in ride:head-to-pickup,
    // ride:verify-otp, ride:complete, ride:cancel) always saw `undefined`
    // and silently fell back to single-ride behavior, even for bundled
    // rides. This was the root cause of "ShuttleSession is not the source
    // of truth" and the "driver UI is inconsistent" symptoms.
    shuttleSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ShuttleSession',
      index: true,
    },
    // Authoritative per-passenger lifecycle for bundled rides. This is kept
    // distinct from the aggregate ShuttleSession status so a passenger can
    // never be advanced by an action targeting a different ride request.
    passengerLifecycle: {
      type: String,
      enum: ['PENDING', 'BOARDED', 'DROPPED'],
      default: 'PENDING',
      index: true,
    },
    otp: {
      code: { type: String },
      expiresAt: { type: Date },
      verified: { type: Boolean, default: false },
    },
    fare: {
      estimated: { type: Number },
      final: { type: Number },
      breakdown: {
        baseFare: { type: Number },
        distanceCharge: { type: Number },
        timeCharge: { type: Number },
        nightCharge: { type: Number },
        surgeCharge: { type: Number },
      },
      details: {
        distanceKm: { type: Number },
        durationMinutes: { type: Number },
        surgeMultiplier: { type: Number, default: 1.0 },
        surgeLabel: { type: String },
        isNightTime: { type: Boolean },
      },
    },
    requestedAt: { type: Date, default: Date.now },
    // Flexy booking contract: every request records whether pickup is now or
    // at an explicitly requested future time. The API rejects a timestamp for
    // IMMEDIATE requests and requires one for SCHEDULED requests.
    pickupIntent: {
      type: String,
      enum: ['IMMEDIATE', 'SCHEDULED'],
      required: true,
      default: 'IMMEDIATE',
      index: true,
    },
    scheduledPickupAt: { type: Date, index: true },
    acceptedAt: { type: Date },
    pickupAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelReason: { type: String, trim: true },
    cancellationFee: { type: Number, default: 0 },
    payment: {
      orderId: { type: String },
      paymentId: { type: String },
      status: { 
        type: String, 
        enum: ['not_initiated', 'pending', 'completed', 'failed', 'refunded'],
        default: 'not_initiated'
      },
      amount: { type: Number },
      verifiedAt: { type: Date },
      refundId: { type: String },
      refundStatus: { type: String },
      refundAmount: { type: Number },
      refundReason: { type: String },
      refundedAt: { type: Date },
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 5 * 60 * 1000), // 5 min expiry
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    isBundled: { type: Boolean, default: false },
    bundleId: { type: String, index: true },
    // A server-assigned dispatch constraint for controlled demo rides.
    // It is never supplied by a client and prevents fallback matching.
    dispatchPolicy: {
      type: String,
      enum: ['STANDARD', 'RAJU_KUMAR_ONLY'],
      default: 'STANDARD',
      index: true,
    },
    // Set when the ride reaches a terminal state (EXPIRED, CANCELLED, COMPLETED).
    // Used by the TTL index below to auto-delete old records. Independent of
    // updatedAt so subsequent saves do not reset the expiry clock.
    ttlAt: { type: Date },
  },
  { timestamps: true }
);

rideRequestSchema.index({ status: 1, expiresAt: 1 });
rideRequestSchema.index({ pickupLocation: '2dsphere' });
rideRequestSchema.index({ dropLocation: '2dsphere' });
rideRequestSchema.index({ customerId: 1, status: 1 });
// Supports ownership- and predecessor-state-scoped passenger transitions.
rideRequestSchema.index({ shuttleSessionId: 1, acceptedDriverId: 1, passengerLifecycle: 1 });

// Auto-delete rides 7 days after they reach a terminal state (EXPIRED, CANCELLED, COMPLETED).
// We index `ttlAt` (not `updatedAt`) so any later administrative save does not
// reset the 7-day clock. Active rides (PENDING/ACCEPTED/RESERVED/DRIVER_ARRIVING/IN_PROGRESS)
// are not affected because ttlAt is unset on them.
rideRequestSchema.index(
  { ttlAt: 1 },
  {
    expireAfterSeconds: 7 * 24 * 60 * 60,
    partialFilterExpression: { status: { $in: ['EXPIRED', 'CANCELLED', 'COMPLETED'] } },
  }
);

rideRequestSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

// When a ride reaches a terminal state, clear matchedDrivers to free up
// storage and reduce query payload. Terminal states: EXPIRED, CANCELLED,
// COMPLETED. Active rides (PENDING/ACCEPTED/RESERVED/DRIVER_ARRIVING/IN_PROGRESS)
// retain matchedDrivers for analytics and ride:unavailable notifications.
function clearMatchedDriversOnTerminal(next) {
  // Prevent mutations on soft-deleted rides.
  this.where({ isDeleted: false });
  const update = this.getUpdate();
  if (!update) return next();
  // findOneAndUpdate/updateOne: status is in $set
  // updateMany: status is in $set
  const newStatus = (update.$set && update.$set.status) || update.status;
  if (newStatus && ['EXPIRED', 'CANCELLED', 'COMPLETED'].includes(newStatus)) {
    if (!update.$set) update.$set = {};
    update.$set.matchedDrivers = [];
  }
  next();
}

rideRequestSchema.pre('findOneAndUpdate', clearMatchedDriversOnTerminal);
rideRequestSchema.pre('updateOne', clearMatchedDriversOnTerminal);
rideRequestSchema.pre('updateMany', clearMatchedDriversOnTerminal);

rideRequestSchema.pre('save', function (next) {
  if (this.isModified('status') && ['EXPIRED', 'CANCELLED', 'COMPLETED'].includes(this.status)) {
    this.matchedDrivers = [];
  }
  next();
});

// --- TEMPORARY EXECUTION TRACE INSTRUMENTATION ---

function getStackDetails() {
  const err = new Error();
  const stack = err.stack || '';
  const lines = stack.split('\n');
  
  // Find the caller from the src/ folder (excluding mongoose internals and RideRequest.js)
  const callerLine = lines.find(line => 
    line.includes('src') && 
    !line.includes('node_modules') && 
    !line.includes('RideRequest.js')
  );

  if (!callerLine) {
    return {
      fileName: 'Unknown',
      functionName: 'Unknown',
      stackLocation: 'Unknown'
    };
  }

  let functionName = 'anonymous';
  let fileInfo = '';

  const matchWithFunc = callerLine.match(/at\s+([^\s]+)\s+\((.+)\)/);
  if (matchWithFunc) {
    functionName = matchWithFunc[1];
    fileInfo = matchWithFunc[2];
  } else {
    const matchNoFunc = callerLine.match(/at\s+(.+)/);
    if (matchNoFunc) {
      fileInfo = matchNoFunc[1];
    }
  }

  const parts = fileInfo.split(':');
  let fileName = 'Unknown';
  let stackLocation = 'Unknown';
  if (parts.length >= 2) {
    const col = parts.pop();
    const line = parts.pop();
    const filePath = parts.join(':');
    fileName = filePath.substring(filePath.lastIndexOf('\\') + 1).substring(filePath.lastIndexOf('/') + 1);
    stackLocation = fileInfo;
  } else {
    fileName = fileInfo;
  }

  return {
    fileName,
    functionName,
    stackLocation
  };
}

rideRequestSchema.post('init', function (doc) {
  doc._originalValues = {
    status: doc.status,
    isBundled: doc.isBundled,
    isDeleted: doc.isDeleted,
    bundleId: doc.bundleId,
    shuttleSessionId: doc.shuttleSessionId
  };
});

rideRequestSchema.pre('save', function (next) {
  const trackedFields = ['status', 'isBundled', 'isDeleted', 'bundleId', 'shuttleSessionId'];
  const prev = {};
  const curr = {};
  let changed = false;

  for (const field of trackedFields) {
    const isNewDoc = this.isNew;
    const originalVal = isNewDoc ? undefined : this._originalValues?.[field];
    const currentVal = this.get(field);

    if (originalVal !== currentVal) {
      prev[field] = originalVal;
      curr[field] = currentVal;
      changed = true;
    }
  }

  if (changed) {
    const details = getStackDetails();
    console.log('[RIDE_REQUEST_SAVE_TRACE]', {
      rideRequestId: this._id,
      previousValues: prev,
      newValues: curr,
      fileName: details.fileName,
      functionName: details.functionName,
      stackLocation: details.stackLocation
    });
  }
  next();
});

function logQueryUpdate(methodName) {
  return async function (next) {
    const update = this.getUpdate();
    if (!update) return next();

    const trackedFields = ['status', 'isBundled', 'isDeleted', 'bundleId', 'shuttleSessionId'];
    
    // Check if any tracked fields are in the update
    let hasTrackedChanges = false;
    const newValues = {};

    if (update.$set) {
      for (const field of trackedFields) {
        if (update.$set[field] !== undefined) {
          hasTrackedChanges = true;
          newValues[field] = update.$set[field];
        }
      }
    } else {
      for (const field of trackedFields) {
        if (update[field] !== undefined) {
          hasTrackedChanges = true;
          newValues[field] = update[field];
        }
      }
    }

    if (update.$unset) {
      for (const field of trackedFields) {
        if (update.$unset[field] !== undefined) {
          hasTrackedChanges = true;
          newValues[field] = null;
        }
      }
    }

    if (hasTrackedChanges) {
      const queryFilter = this.getQuery();
      const docs = await this.model.find(queryFilter).lean();
      const details = getStackDetails();

      for (const doc of docs) {
        const prevValues = {};
        for (const field of trackedFields) {
          prevValues[field] = doc[field];
        }

        console.log(`[RIDE_REQUEST_${methodName.toUpperCase()}_TRACE]`, {
          rideRequestId: doc._id,
          previousValues: prevValues,
          newValues: newValues,
          fileName: details.fileName,
          functionName: details.functionName,
          stackLocation: details.stackLocation
        });
      }
    }

    next();
  };
}

rideRequestSchema.pre('findOneAndUpdate', logQueryUpdate('findOneAndUpdate'));
rideRequestSchema.pre('updateOne', logQueryUpdate('updateOne'));
rideRequestSchema.pre('updateMany', logQueryUpdate('updateMany'));

module.exports = mongoose.model('RideRequest', rideRequestSchema);
