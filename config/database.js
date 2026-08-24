const mongoose = require('mongoose');
const config = require('./config');
const logger = require('../utils/logger');

mongoose.set('strictQuery', true);

const connectDB = async () => {
  logger.info(`Initializing connection to MongoDB... env: ${process.env.NODE_ENV || 'development'}`);
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
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

    // --- Backfill invariants for pre-existing development data ---
    // Ensure at most one "current" subscription per customer carries isCurrent
    // (the partial unique index depends on it), keeping the most recent.
    const currentSubs = await Subscription.find({
      status: { $in: ['ACTIVE', 'PAUSED', 'PENDING_PAYMENT'] },
      isDeleted: false,
    }).sort({ createdAt: -1 }).select('_id customerId').lean();
    const seenCustomers = new Set();
    let releasedDuplicates = 0;
    for (const sub of currentSubs) {
      const key = sub.customerId.toString();
      if (seenCustomers.has(key)) {
        await Subscription.updateOne({ _id: sub._id }, { $set: { isCurrent: false } });
        releasedDuplicates += 1;
      } else {
        seenCustomers.add(key);
        await Subscription.updateOne({ _id: sub._id }, { $set: { isCurrent: true } });
      }
    }
    await Subscription.updateMany(
      { status: { $in: ['CANCELLED', 'COMPLETED', 'EXPIRED'] }, isCurrent: true },
      { $set: { isCurrent: false } }
    );
    if (releasedDuplicates > 0) {
      logger.warn(`[Seed] Released ${releasedDuplicates} pre-existing duplicate current subscriptions`);
    }

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
