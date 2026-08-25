const mongoose = require('mongoose');
const config = require('./config');
const logger = require('../utils/logger');

mongoose.set('strictQuery', true);

/**
 * Drop an index that the schema no longer declares.
 *
 * Mongoose's autoIndex only ever *creates* indexes. An index it used to declare
 * stays in the database forever, still enforcing its old constraint, which
 * makes retired invariants fail in a way that looks like an application bug.
 * Matching on shape rather than name catches indexes created under either the
 * default name or an explicit one.
 */
const dropRetiredIndex = async (Model, matches, label) => {
  try {
    const existing = await Model.collection.indexes();
    for (const idx of existing) {
      if (idx.name === '_id_' || !matches(idx)) continue;
      await Model.collection.dropIndex(idx.name);
      logger.warn(`[Migration] Dropped retired index ${Model.modelName}.${idx.name}${label ? ` (${label})` : ''}`);
    }
  } catch (err) {
    // NamespaceNotFound (26) just means the collection doesn't exist yet.
    if (err.code !== 26) {
      logger.error(`[Migration] Could not inspect ${Model.modelName} indexes: ${err.message}`);
    }
  }
};

/**
 * Serialize a filter document so two equivalent filters compare equal.
 *
 * Key order must not matter here. `JSON.stringify` preserves insertion order, and
 * the order MongoDB echoes a stored filter back in is not guaranteed to match the
 * order the schema declares it — so a naive string compare reports "drifted" on
 * every boot and drops/rebuilds a unique index each time the process starts.
 */
const canonicalize = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
};

/**
 * Drop and rebuild a live index whose options no longer match the schema.
 *
 * MongoDB will not redefine an index in place. Given a name that already exists
 * with different options it fails with IndexOptionsConflict (85) and *keeps the
 * old index* — so a changed `partialFilterExpression` silently has no effect and
 * the stale predicate goes on enforcing the constraint it always did. autoIndex
 * logs that error and continues, which makes it look as though the new filter
 * simply doesn't work.
 *
 * Narrowing a partial filter can't fail to build: the documents it now covers are
 * a subset of those the old index already indexed uniquely.
 */
const reconcileIndexOptions = async (Model) => {
  const declared = new Map(
    Model.schema.indexes()
      .filter(([, opts]) => opts && opts.name)
      .map(([key, opts]) => [opts.name, { key, opts }])
  );
  if (declared.size === 0) return;

  let live;
  try {
    live = await Model.collection.indexes();
  } catch (err) {
    // NamespaceNotFound (26) just means the collection doesn't exist yet.
    if (err.code !== 26) {
      logger.error(`[Migration] Could not inspect ${Model.modelName} indexes: ${err.message}`);
    }
    return;
  }

  for (const idx of live) {
    const want = declared.get(idx.name);
    if (!want) continue;
    if (Boolean(idx.unique) === Boolean(want.opts.unique)
      && canonicalize(idx.partialFilterExpression) === canonicalize(want.opts.partialFilterExpression)) {
      continue;
    }

    const before = JSON.stringify(idx.partialFilterExpression || null);
    const after = JSON.stringify(want.opts.partialFilterExpression || null);
    try {
      await Model.collection.dropIndex(idx.name);
      logger.warn(
        `[Migration] ${Model.modelName}.${idx.name} drifted from the schema `
        + `(live partialFilterExpression ${before}, declared ${after}) — dropping to rebuild.`
      );
    } catch (err) {
      logger.error(`[Migration] Could not drop ${Model.modelName}.${idx.name}: ${err.message}`);
      continue; // Old index still stands; nothing lost.
    }

    // Rebuild here rather than leaving it to autoIndex: autoIndex is off in
    // production, and where it is on it may already have run for this model, in
    // which case the drop above would leave NO index — strictly worse than a
    // stale filter, because the uniqueness guarantee disappears entirely.
    try {
      await Model.collection.createIndex(want.key, want.opts);
      logger.warn(`[Migration] Rebuilt ${Model.modelName}.${idx.name} from the schema declaration.`);
    } catch (err) {
      // The index is now gone and could not be recreated. Say so unmistakably:
      // whatever constraint it enforced is currently unenforced.
      logger.error(
        `[Migration] CRITICAL: dropped ${Model.modelName}.${idx.name} but could not recreate it `
        + `(${err.message}). The ${want.opts.unique ? 'uniqueness ' : ''}constraint it enforced is `
        + `NOT active. Recreate it manually: db.${Model.collection.collectionName}.createIndex(`
        + `${JSON.stringify(want.key)}, ${JSON.stringify(want.opts)})`
      );
    }
  }
};

/**
 * Schema migrations that must run in EVERY environment, production included —
 * unlike seedDatabase, which is development-only.
 */
const runMigrations = async () => {
  const Subscription = require('../models/Subscription');

  // `isCurrent` mirrors status and is the partial-index predicate. Multiple
  // current subscriptions per customer are supported now, so every live
  // subscription carries the flag — not just one per customer, as before.
  await Subscription.updateMany(
    { status: { $in: ['ACTIVE', 'PAUSED', 'PENDING_PAYMENT'] }, isDeleted: false, isCurrent: { $ne: true } },
    { $set: { isCurrent: true } }
  );
  await Subscription.updateMany(
    { $or: [{ status: { $in: ['CANCELLED', 'COMPLETED', 'EXPIRED'] } }, { isDeleted: true }], isCurrent: true },
    { $set: { isCurrent: false } }
  );

  // Retire the single-subscription index. Databases created before multiple
  // subscriptions were supported carry a unique index on { customerId } alone,
  // which would keep rejecting the second subscription with E11000 regardless
  // of what the application code allows. Replaced by
  // customer_schedule_slot_unique in models/Subscription.js.
  await dropRetiredIndex(
    Subscription,
    (idx) => idx.unique
      && Object.keys(idx.key || {}).length === 1
      && idx.key.customerId === 1,
    'single-subscription-per-customer',
  );

  // Retire the one-trip-per-driver-per-day index, replaced by
  // driver_service_slot_unique ({ driverId, serviceDate, pickupTime }) in
  // models/Trip.js. While it survives, a driver's second run of the day fails
  // with E11000 and the generator's duplicate-key path merges those passengers
  // into the first run instead — the exact bug the new key fixes.
  const Trip = require('../models/Trip');
  await dropRetiredIndex(
    Trip,
    (idx) => idx.unique
      && Object.keys(idx.key || {}).length === 2
      && idx.key.driverId === 1
      && idx.key.serviceDate === 1,
    'one-trip-per-driver-per-day',
  );

  // The meaningful unique indexes (driver_service_slot_unique,
  // unique_active_route_service_date, customer_schedule_slot_unique) had their
  // partialFilterExpression narrowed this pass — e.g. `{ isDeleted: false }`
  // -> `{ isDeleted: false, driverId: { $type: 'objectId' } }` — so a live copy
  // with the old filter still enforces the old constraint. Drop-and-rebuild.
  await reconcileIndexOptions(Subscription);
  await reconcileIndexOptions(Trip);
};

const connectDB = async () => {
  logger.info(`Initializing connection to MongoDB... env: ${process.env.NODE_ENV || 'development'}`);
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    await runMigrations();
    const nodeEnv = process.env.NODE_ENV || 'development';
    if (nodeEnv !== 'production' && nodeEnv !== 'prod') {
      await seedDatabase(nodeEnv);
    } else {
      logger.info('Seeding skipped in PRODUCTION environment.');
    }
  } catch (error) {
    logger.error(`Initial database connection error: ${error.message}`);
    process.exit(1);
  }
};

const seedDatabase = async (env) => {
  try {
    const User = require('../models/User');
    const Admin = require('../models/Admin');
    const Driver = require('../models/Driver');
    const Customer = require('../models/Customer');
    const Route = require('../models/Route');
    const Area = require('../models/Area');
    const Subscription = require('../models/Subscription');
    const Plan = require('../models/Plan');
    const { hashPassword } = require('../utils/passwordHelper');

    const isTest = env === 'test';
    const hashedPassword = await hashPassword('password123');

    let route = await Route.findOne({ name: 'HSR Layout - Electronic City' });
    if (!route) {
      route = await Route.create({
        name: 'HSR Layout - Electronic City',
        startLocation: 'HSR Layout, Bangalore',
        endLocation: 'Electronic City, Bangalore',
        stops: [
          { stopName: 'HSR Layout Sector 2', sequenceOrder: 1, location: { type: 'Point', coordinates: [77.6309, 12.9279] } },
          { stopName: 'Koramangala Block 5', sequenceOrder: 2, location: { type: 'Point', coordinates: [77.6211, 12.9348] } },
          { stopName: 'Electronic City Phase 1', sequenceOrder: 3, location: { type: 'Point', coordinates: [77.6683, 12.8489] } },
        ],
        status: 'ACTIVE',
      });
      logger.info('Seeded Route: HSR Layout - Electronic City');
    }

    // Service area — required by the subscription matching engine.
    let area = await Area.findOne({ name: 'HSR Layout' });
    if (!area) {
      area = await Area.create({
        name: 'HSR Layout',
        center: { type: 'Point', coordinates: [77.6501, 12.9141] },
        radiusKm: 5,
        status: 'ACTIVE',
      });
      logger.info('Seeded Area: HSR Layout (5 km radius)');
    }

    let driverUser = await User.findOne({ phone: '9876543210' });
    let driverProfile = null;
    if (!driverUser) {
      driverUser = await User.create({ phone: '9876543210', password: hashedPassword, role: 'Driver', status: 'ACTIVE', hasCustomPassword: true });
      driverProfile = await Driver.create({
        userId: driverUser._id,
        name: 'Raju Kumar',
        vehicleNumber: 'KA01MJ5678',
        vehicleModel: 'Tata Nexon EV',
        vehicleCapacity: 6,
        licenseNumber: 'KA-DL-123456',
        routeId: route._id,
        areaId: area._id,
        currentLocation: { type: 'Point', coordinates: [77.6501, 12.9141] },
        status: 'ACTIVE',
      });
      logger.info('Seeded Driver: Raju Kumar (9876543210)');
    } else {
      driverProfile = await Driver.findOne({ userId: driverUser._id });
    }

    // Convert the former demo customer account into the requested driver account.
    // This is idempotent so it also repairs an existing development database.
    const requestedDriverPhone = '7019268918';
    let requestedDriverUser = await User.findOne({ phone: requestedDriverPhone });
    if (!requestedDriverUser) {
      requestedDriverUser = await User.create({
        phone: requestedDriverPhone,
        password: hashedPassword,
        role: 'Driver',
        status: 'ACTIVE',
        hasCustomPassword: true,
      });
    } else if (requestedDriverUser.role !== 'Driver') {
      const formerCustomer = await Customer.findOne({ userId: requestedDriverUser._id });
      if (formerCustomer) {
        await Subscription.deleteMany({ customerId: formerCustomer._id });
        await Customer.deleteOne({ _id: formerCustomer._id });
      }
      requestedDriverUser.role = 'Driver';
      requestedDriverUser.status = 'ACTIVE';
      requestedDriverUser.hasCustomPassword = true;
      await requestedDriverUser.save();
    }

    let requestedDriverProfile = await Driver.findOne({ userId: requestedDriverUser._id });
    if (!requestedDriverProfile) {
      requestedDriverProfile = await Driver.create({
        userId: requestedDriverUser._id,
        name: 'Driver 7019268918',
        vehicleNumber: 'KA01AB7019',
        vehicleModel: 'Maruti Swift',
        vehicleCapacity: 4,
        licenseNumber: 'KA-DL-701926',
        routeId: route._id,
        areaId: area._id,
        currentLocation: { type: 'Point', coordinates: [77.6501, 12.9141] },
        status: 'ACTIVE',
        isOnline: false,
        isAvailable: false,
      });
    }
    logger.info(`Seeded Driver: ${requestedDriverPhone} / password123`);

    let customerUser = await User.findOne({ phone: '7019268917' });
    let customerProfile = null;
    if (!customerUser) {
      customerUser = await User.create({ phone: '7019268917', password: hashedPassword, role: 'Customer', status: 'ACTIVE', hasCustomPassword: true });
      customerProfile = await Customer.create({
        userId: customerUser._id,
        name: 'Ravi Kumar',
        homeLocation: { address: 'HSR Layout, Bangalore', coordinates: [77.6309, 12.9279] },
        pickupLocation: { address: 'HSR Layout Sector 2', coordinates: [77.6309, 12.9279] },
        dropLocation: { address: 'Electronic City, Bangalore', coordinates: [77.6683, 12.8489] },
        // Pre-funded wallet so the demo customer can subscribe via wallet.
        walletBalance: 5000,
      });
      logger.info('Default Customer seeded: 7019268917 / password123 (wallet ₹5000)');
    } else {
      customerProfile = await Customer.findOne({ userId: customerUser._id });
    }

    const adminUserExists = await User.findOne({ role: 'Admin' });
    if (!adminUserExists) {
      const adminUser = await User.create({ phone: '9999999999', password: hashedPassword, role: 'Admin', status: 'ACTIVE', hasCustomPassword: true });
      await Admin.create({ userId: adminUser._id, name: 'Administrator', permissions: ['ALL'], role: 'Super Admin', status: 'ACTIVE' });
      logger.info('Default Admin seeded: 9999999999 / password123');
    }

    // Seed Plans
    const plansData = [
      {
        name: 'Flexy',
        serviceType: 'Home-to-Office',
        tier: 'Flexy',
        description: 'Flexible booking. Cancel 1-2 hrs before. Pickup/dropoff within 5km of driver.',
        durationDays: 30,
        price: 2499,
        pauseDaysAllowed: 5,
        features: ['Flexible booking', 'Cancel before 1-2 hrs', 'All locations within 5km', 'Pickup + Dropoff', 'Single person ride'],
        bookingRules: {
          maxPassengersPerBooking: 1,
          minAdvanceBookingMinutes: 120,
          allowedDaysPerWeek: 7,
          allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
          isAlternateDay: false,
          isSharedRide: false,
          useManagedStops: false,
        },
      },
      {
        name: 'Hybrid',
        serviceType: 'Home-to-Office',
        tier: 'Hybrid',
        description: '3 days/week service. Pick your commute days. Shared shuttle with managed stops.',
        durationDays: 30,
        price: 1799,
        pauseDaysAllowed: 3,
        features: ['3 days per week', 'Pick your days', 'Shared shuttle', 'Managed bus stops'],
        bookingRules: {
          maxPassengersPerBooking: 6,
          minAdvanceBookingMinutes: 0,
          allowedDaysPerWeek: 3,
          allowedWeekdays: [],
          isAlternateDay: false,
          isSharedRide: true,
          useManagedStops: true,
        },
      },
      {
        name: 'Weekday',
        serviceType: 'Home-to-Office',
        tier: 'Weekday',
        description: 'Monday to Friday service. 5 days/week. Shared shuttle with managed stops.',
        durationDays: 30,
        price: 1999,
        pauseDaysAllowed: 4,
        features: ['5 days/week', 'Mon-Fri', 'Shared shuttle', 'Managed bus stops'],
        bookingRules: {
          maxPassengersPerBooking: 6,
          minAdvanceBookingMinutes: 0,
          allowedDaysPerWeek: 5,
          allowedWeekdays: [1, 2, 3, 4, 5],
          isAlternateDay: false,
          isSharedRide: true,
          useManagedStops: true,
        },
      },
      {
        name: 'Stop-to-Stop',
        serviceType: 'Stop-to-Stop',
        tier: 'Standard',
        description: 'Pickup and dropoff from designated bus stops only. All 7 days.',
        durationDays: 30,
        price: 1299,
        pauseDaysAllowed: 2,
        features: ['Bus stop pickup', 'Bus stop dropoff', 'Fixed routes', 'Affordable', '7 days/week'],
        bookingRules: {
          maxPassengersPerBooking: 6,
          minAdvanceBookingMinutes: 0,
          allowedDaysPerWeek: 7,
          allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
          isAlternateDay: false,
          isSharedRide: true,
          useManagedStops: true,
        },
      },
    ];

    for (const planData of plansData) {
      await Plan.findOneAndUpdate(
        { name: planData.name },
        { $set: planData },
        { upsert: true, new: true }
      );
      logger.info(`Seeded plan: ${planData.name}`);
    }

    // Note: the isCurrent backfill and retired-index drop live in
    // runMigrations(), which runs in production too.

    // Recompute each driver's activeSubscriptionCount from live ACTIVE assignments.
    const driverCounts = await Subscription.aggregate([
      { $match: { status: 'ACTIVE', assignedDriverId: { $ne: null }, isDeleted: false } },
      { $group: { _id: '$assignedDriverId', c: { $sum: 1 } } },
    ]);
    const countMap = new Map(driverCounts.map((r) => [r._id.toString(), r.c]));
    const allDrivers = await Driver.find({ isDeleted: false }).select('_id').lean();
    for (const d of allDrivers) {
      await Driver.updateOne({ _id: d._id }, { $set: { activeSubscriptionCount: countMap.get(d._id.toString()) || 0 } });
    }

    if (!isTest) {
      let koraRoute = await Route.findOne({ name: 'Koramangala - Whitefield' });
      if (!koraRoute) {
        koraRoute = await Route.create({
          name: 'Koramangala - Whitefield',
          startLocation: 'Koramangala, Bangalore',
          endLocation: 'Whitefield, Bangalore',
          stops: [
            { stopName: 'Koramangala Block 5', sequenceOrder: 1, location: { type: 'Point', coordinates: [77.6211, 12.9348] } },
            { stopName: 'HSR Layout Sector 2', sequenceOrder: 2, location: { type: 'Point', coordinates: [77.6309, 12.9279] } },
            { stopName: 'Whitefield ITPL', sequenceOrder: 3, location: { type: 'Point', coordinates: [77.7289, 12.9868] } },
          ],
          status: 'ACTIVE',
        });
        logger.info('Seeded Route: Koramangala - Whitefield');
      }
    }
  } catch (error) {
    logger.error(`Error during database seeding: ${error.message}`);
  }
};

mongoose.connection.on('connected', () => logger.info('MongoDB connected.'));
mongoose.connection.on('error', (err) => logger.error(`MongoDB error: ${err.message}`));
mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected.'));

const closeDatabaseConnection = async () => {
  if (mongoose.connection.readyState !== 0) {
    logger.info('Closing MongoDB connection...');
    try {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed.');
    } catch (err) {
      logger.error(`Error closing MongoDB: ${err.message}`);
    }
  }
};

module.exports = { connectDB, closeDatabaseConnection, connectionState: () => mongoose.connection.readyState, seedDatabase };
