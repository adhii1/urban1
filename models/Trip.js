const mongoose = require('mongoose');

const stopSnapshotSchema = new mongoose.Schema(
  {
    stopId: { type: String },
    stopName: { type: String },
    sequenceOrder: { type: Number },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number] },
    },
  },
  { _id: false }
);

const manifestConflictSchema = new mongoose.Schema(
  {
    state: {
      type: String,
      enum: ['NONE', 'REQUIRES_RESOLUTION'],
      default: 'NONE',
    },
    reason: { type: String, trim: true },
    detectedAt: { type: Date },
  },
  { _id: false }
);

const manifestEntrySchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      index: true,
    },
    pickupStop: stopSnapshotSchema,
    dropStop: stopSnapshotSchema,
    status: {
      type: String,
      enum: ['PENDING', 'BOARDED', 'DROPPED', 'NO_SHOW'],
      default: 'PENDING',
    },
    conflict: {
      type: manifestConflictSchema,
      default: () => ({ state: 'NONE' }),
    },
    boardedAt: { type: Date },
    droppedAt: { type: Date },
  },
  { _id: true }
);

const tripSchema = new mongoose.Schema(
  {
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route',
      required: true,
      index: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      index: true,
    },
    // serviceDate is the normalized local calendar day used for idempotency.
    // tripDate remains for existing API responses and planned departure time.
    serviceDate: {
      type: Date,
      required: true,
      index: true,
    },
    tripDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: 'SCHEDULED',
      index: true,
    },
    manifest: [manifestEntrySchema],
    startedAt: { type: Date },
    completedAt: { type: Date },
    cancelReason: {
      type: String,
      trim: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: { type: Date },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
  },
  {
    timestamps: true,
  }
);

tripSchema.pre('validate', function normalizeServiceDate(next) {
  if (!this.serviceDate && this.tripDate) {
    const normalized = new Date(this.tripDate);
    normalized.setHours(0, 0, 0, 0);
    this.serviceDate = normalized;
  }
  next();
});

// Existing manifest writers may still provide stop snapshots without a stable
// ID. Enrich those writes from their route while the migration is in progress.
tripSchema.pre('validate', async function enrichLegacyManifestSnapshots() {
  const entriesNeedingIds = (this.manifest || []).some((entry) => (
    (entry.pickupStop && !entry.pickupStop.stopId)
    || (entry.dropStop && !entry.dropStop.stopId)
  ));
  if (!entriesNeedingIds || !this.routeId) return;

  const Route = require('./Route');
  const route = await Route.findById(this.routeId).select('stops').lean();
  if (!route) return;
  const findCurrentStop = (snapshot) => route.stops.find((stop) => (
    stop.stopId === snapshot.stopId
    || (stop.sequenceOrder === snapshot.sequenceOrder && stop.stopName === snapshot.stopName)
  ));

  for (const entry of this.manifest) {
    for (const key of ['pickupStop', 'dropStop']) {
      const snapshot = entry[key];
      if (!snapshot || snapshot.stopId) continue;
      const currentStop = findCurrentStop(snapshot);
      if (currentStop) snapshot.stopId = currentStop.stopId;
    }
  }
});

tripSchema.pre(/^find/, function excludeDeleted(next) {
  this.where({ isDeleted: false });
  next();
});

tripSchema.pre('findOneAndUpdate', function excludeDeletedFromUpdates(next) {
  this.where({ isDeleted: false });
  next();
});

// Legacy trips without serviceDate remain readable during migration. New and
// backfilled active trips are unique by route and normalized service date.
tripSchema.index(
  { routeId: 1, serviceDate: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false, serviceDate: { $exists: true } },
    name: 'unique_active_route_service_date',
  }
);
tripSchema.index({ 'manifest.subscriptionId': 1, serviceDate: 1, isDeleted: 1 });

module.exports = mongoose.model('Trip', tripSchema);
