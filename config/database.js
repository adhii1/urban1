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
    const Trip = require('../models/Trip');
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
        status: 'ACTIVE',
      });
      logger.info('Seeded Driver: Raju Kumar (9876543210)');
    } else {
      driverProfile = await Driver.findOne({ userId: driverUser._id });
    }

    let customerUser = await User.findOne({ phone: '7019268918' });
    let customerProfile = null;
    if (!customerUser) {
      customerUser = await User.create({ phone: '7019268918', password: hashedPassword, role: 'Customer', status: 'ACTIVE', hasCustomPassword: true });
      customerProfile = await Customer.create({
        userId: customerUser._id,
        name: 'Ravi Kumar',
        homeLocation: { address: 'HSR Layout, Bangalore', coordinates: [77.6309, 12.9279] },
        pickupLocation: { address: 'HSR Layout Sector 2', coordinates: [77.6309, 12.9279] },
        dropLocation: { address: 'Electronic City, Bangalore', coordinates: [77.6683, 12.8489] },
      });
      const flexyPlan = await Plan.findOne({ name: 'Flexy' });
      const seedRoute = await Route.findOne();

      if (flexyPlan && seedRoute) {
        const subscription = await Subscription.create({
          customerId: customerProfile._id,
          planId: flexyPlan._id,
          routeId: seedRoute._id,
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          remainingPauseDays: flexyPlan.pauseDaysAllowed,
          status: 'ACTIVE',
        });
        customerProfile.subscriptionId = subscription._id;
        await customerProfile.save();
        console.log('Seeded subscription with plan:', flexyPlan.name);
      } else {
        console.log('Could not seed subscription: missing plan or route');
      }
      logger.info('Default Customer seeded: 7019268918 / password123');
    } else {
      customerProfile = await Customer.findOne({ userId: customerUser._id });
    }

    let hsrTrip = await Trip.findOne({ routeId: route._id });
    if (!hsrTrip) {
      const { buildTripManifest } = require('../utils/geoHelper');
      const manifest = customerProfile
        ? await buildTripManifest([customerProfile._id], route._id)
        : [];
      hsrTrip = await Trip.create({
        routeId: route._id,
        driverId: driverProfile._id,
        tripDate: new Date(),
        status: 'SCHEDULED',
        manifest,
      });
      logger.info('Seeded Trip: HSR Layout - Electronic City (SCHEDULED)');
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
