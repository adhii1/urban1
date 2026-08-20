require('dotenv').config({ path: require('path').join(__dirname, '../.env.dev') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Driver = require('../models/Driver');
const Customer = require('../models/Customer');
const Route = require('../models/Route');
const Admin = require('../models/Admin');
const Plan = require('../models/Plan');
const Area = require('../models/Area');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/urban-commute';

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Clear existing data
  const collections = ['users', 'drivers', 'customers', 'routes', 'admins', 'plans', 'areas', 'riderequests', 'notifications', 'subscriptions', 'trips'];
  for (const col of collections) {
    try {
      await mongoose.connection.db.dropCollection(col);
    } catch (e) {
      // Collection may not exist
    }
  }
  console.log('Cleared existing data');

  const hashedPassword = await bcrypt.hash('password123', 10);

  // --- 1 Admin ---
  const adminUser = await User.create({
    phone: '9000000001',
    password: hashedPassword,
    role: 'Admin',
    status: 'ACTIVE',
  });
  await Admin.create({
    userId: adminUser._id,
    name: 'Admin',
    permissions: ['MANAGE_DRIVERS', 'MANAGE_SETTINGS', 'APPROVE_PAYOUTS'],
    role: 'Super Admin',
  });
  console.log('Created 1 admin  → phone: 9000000001 / password: password123');

  // --- 1 Service Area ---
  const area = await Area.create({
    name: 'HSR Layout',
    center: { type: 'Point', coordinates: [77.6501, 12.9141] },
    radiusKm: 5,
    status: 'ACTIVE',
  });
  console.log('Created 1 area   → HSR Layout (5 km radius)');

  // --- 1 Route ---
  const route = await Route.create({
    name: 'HSR to Electronic City',
    startLocation: 'HSR Layout',
    endLocation: 'Electronic City Phase 1',
    status: 'ACTIVE',
    stops: [
      { stopName: 'HSR Layout Sector 2', sequenceOrder: 1, location: { type: 'Point', coordinates: [77.6309, 12.9279] } },
      { stopName: 'Silk Board Junction', sequenceOrder: 2, location: { type: 'Point', coordinates: [77.6231, 12.9172] } },
      { stopName: 'Bommanahalli', sequenceOrder: 3, location: { type: 'Point', coordinates: [77.6289, 12.9015] } },
      { stopName: 'Electronic City Phase 1', sequenceOrder: 4, location: { type: 'Point', coordinates: [77.6683, 12.8489] } },
    ],
  });
  console.log('Created 1 route  → HSR to Electronic City');

  // --- 1 Driver ---
  const driverUser = await User.create({
    phone: '9000000002',
    password: hashedPassword,
    role: 'Driver',
    status: 'ACTIVE',
  });
  await Driver.create({
    userId: driverUser._id,
    name: 'Raju Kumar',
    vehicleNumber: 'KA51AB1234',
    vehicleModel: 'Maruti Swift',
    vehicleCapacity: 4,
    licenseNumber: 'KA2020123456',
    routeId: route._id,
    areaId: area._id,
    status: 'ACTIVE',
    currentLocation: { type: 'Point', coordinates: [77.6350, 12.9200] },
    isOnline: false,
    isAvailable: false,
  });
  console.log('Created 1 driver → phone: 9000000002 / password: password123 (Raju Kumar)');

  // --- 1 Customer ---
  const customerUser = await User.create({
    phone: '9000000003',
    password: hashedPassword,
    role: 'Customer',
    status: 'ACTIVE',
  });
  await Customer.create({
    userId: customerUser._id,
    name: 'Priya Sharma',
    homeLocation: { address: '27th Main, HSR Layout', type: 'Point', coordinates: [77.6401, 12.9185] },
    pickupLocation: { address: 'HSR Layout Sector 2', type: 'Point', coordinates: [77.6309, 12.9279] },
    dropLocation: { address: 'Electronic City Phase 1', type: 'Point', coordinates: [77.6683, 12.8489] },
    status: 'ACTIVE',
  });
  console.log('Created 1 customer → phone: 9000000003 / password: password123 (Priya Sharma)');

  // --- Plans (keep for subscription flow) ---
  await Plan.insertMany([
    { name: 'Weekday Commute', serviceType: 'Home-to-Office', tier: 'Weekday', description: 'Mon-Fri fixed commute (auto-scheduled, auto-assigned driver)', durationDays: 30, price: 1999, pauseDaysAllowed: 4, features: ['Mon-Fri', '4 pause days', 'Auto-driver assignment'], isActive: true, bookingRules: { allowedDaysPerWeek: 5, allowedWeekdays: [1, 2, 3, 4, 5], isSharedRide: true, useManagedStops: false } },
    { name: 'Hybrid Commute', serviceType: 'Home-to-Office', tier: 'Hybrid', description: 'Pick your days (e.g. MWF), auto-assigned driver', durationDays: 30, price: 1799, pauseDaysAllowed: 3, features: ['Pick any days', '3 pause days', 'Auto-driver assignment'], isActive: true, bookingRules: { allowedDaysPerWeek: 3, isSharedRide: true, useManagedStops: false } },
    { name: 'Flexy Ride', serviceType: 'Home-to-Office', tier: 'Flexy', description: 'On-demand booking within your area', durationDays: 30, price: 2499, pauseDaysAllowed: 5, features: ['Flexible booking', '5km radius', '5 pause days'], isActive: true, bookingRules: { allowedDaysPerWeek: 7, isSharedRide: false, useManagedStops: false } },
  ]);
  console.log('Created 3 plans  → Weekday, Hybrid, Flexy');

  console.log('\n=== SEED COMPLETE ===');
  console.log('┌────────────────────────────────────────┐');
  console.log('│ Admin:    9000000001 / password123      │');
  console.log('│ Driver:   9000000002 / password123      │');
  console.log('│ Customer: 9000000003 / password123      │');
  console.log('└────────────────────────────────────────┘');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
