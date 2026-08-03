require('dotenv').config({ path: require('path').join(__dirname, '../../.env.dev') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Driver = require('../models/Driver');
const Customer = require('../models/Customer');
const Route = require('../models/Route');
const Admin = require('../models/Admin');
const Plan = require('../models/Plan');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/urban-commute';

// Bangalore center coordinates
const CENTER = { lng: 77.5946, lat: 12.9716 };

// Route definitions with real Bangalore locations
const ROUTES = [
  {
    name: 'HSR to Electronic City',
    startLocation: 'HSR Layout',
    endLocation: 'Electronic City Phase 1',
    stops: [
      { stopName: 'HSR Layout Sector 2', sequenceOrder: 1, location: { type: 'Point', coordinates: [77.6309, 12.9279] } },
      { stopName: 'Silk Board Junction', sequenceOrder: 2, location: { type: 'Point', coordinates: [77.6231, 12.9172] } },
      { stopName: 'Bommanahalli', sequenceOrder: 3, location: { type: 'Point', coordinates: [77.6289, 12.9015] } },
      { stopName: 'Electronic City Phase 1', sequenceOrder: 4, location: { type: 'Point', coordinates: [77.6683, 12.8489] } },
    ],
  },
  {
    name: 'Koramangala to Whitefield',
    startLocation: 'Koramangala Block 5',
    endLocation: 'Whitefield ITPL',
    stops: [
      { stopName: 'Koramangala Block 5', sequenceOrder: 1, location: { type: 'Point', coordinates: [77.6211, 12.9348] } },
      { stopName: 'Marathahalli Bridge', sequenceOrder: 2, location: { type: 'Point', coordinates: [77.6974, 12.9592] } },
      { stopName: 'Brookefield', sequenceOrder: 3, location: { type: 'Point', coordinates: [77.7169, 12.9693] } },
      { stopName: 'Whitefield ITPL', sequenceOrder: 4, location: { type: 'Point', coordinates: [77.7289, 12.9868] } },
    ],
  },
  {
    name: 'Indiranagar to Hebbal',
    startLocation: 'Indiranagar 100 Feet Road',
    endLocation: 'Hebbal Flyover',
    stops: [
      { stopName: 'Indiranagar 100 Feet Road', sequenceOrder: 1, location: { type: 'Point', coordinates: [77.6402, 12.9784] } },
      { stopName: 'MG Road', sequenceOrder: 2, location: { type: 'Point', coordinates: [77.6075, 12.9758] } },
      { stopName: 'Shivajinagar', sequenceOrder: 3, location: { type: 'Point', coordinates: [77.6003, 12.9815] } },
      { stopName: 'Hebbal Flyover', sequenceOrder: 4, location: { type: 'Point', coordinates: [77.5970, 13.0358] } },
    ],
  },
  {
    name: 'JP Nagar to Manyata Tech Park',
    startLocation: 'JP Nagar 6th Phase',
    endLocation: 'Manyata Tech Park',
    stops: [
      { stopName: 'JP Nagar 6th Phase', sequenceOrder: 1, location: { type: 'Point', coordinates: [77.5899, 12.8899] } },
      { stopName: 'Banashankari', sequenceOrder: 2, location: { type: 'Point', coordinates: [77.5735, 12.9250] } },
      { stopName: 'Majestic', sequenceOrder: 3, location: { type: 'Point', coordinates: [77.5726, 12.9767] } },
      { stopName: 'Manyata Tech Park', sequenceOrder: 4, location: { type: 'Point', coordinates: [77.6119, 13.0431] } },
    ],
  },
  {
    name: 'BTM Layout to Sarjapur',
    startLocation: 'BTM Layout 1st Stage',
    endLocation: 'Sarjapur Road',
    stops: [
      { stopName: 'BTM Layout 1st Stage', sequenceOrder: 1, location: { type: 'Point', coordinates: [77.6101, 12.9166] } },
      { stopName: 'Silk Board', sequenceOrder: 2, location: { type: 'Point', coordinates: [77.6231, 12.9172] } },
      { stopName: 'Bellandur', sequenceOrder: 3, location: { type: 'Point', coordinates: [77.6763, 12.9295] } },
      { stopName: 'Sarjapur Road', sequenceOrder: 4, location: { type: 'Point', coordinates: [77.6906, 12.8986] } },
    ],
  },
];

// Generate random coordinates within radius of a center point
function randomCoord(centerLng, centerLat, radiusKm) {
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * radiusKm;
  const latOffset = (distance / 111) * Math.cos(angle);
  const lngOffset = (distance / (111 * Math.cos((centerLat * Math.PI) / 180))) * Math.sin(angle);
  return [centerLng + lngOffset, centerLat + latOffset];
}

// Generate Indian phone number (10 digits starting with 6-9)
function randomPhone(prefix, index) {
  return `${prefix}${String(index).padStart(4, '0')}`;
}

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Clear existing data
  const collections = ['users', 'drivers', 'customers', 'routes', 'admins', 'plans', 'riderequests'];
  for (const col of collections) {
    try {
      await mongoose.connection.db.dropCollection(col);
    } catch (e) {
      // Collection may not exist
    }
  }
  console.log('Cleared existing data');

  const hashedPassword = await bcrypt.hash('password123', 10);

  // Create admin
  const adminUser = await User.create({
    phone: '9000000000',
    password: hashedPassword,
    role: 'Admin',
    status: 'ACTIVE',
  });
  await Admin.create({
    userId: adminUser._id,
    name: 'Super Admin',
    permissions: ['MANAGE_DRIVERS', 'MANAGE_SETTINGS', 'APPROVE_PAYOUTS'],
    role: 'Super Admin',
  });
  console.log('Created admin (phone: 9000000000, password: password123)');

  // Create plans
  const plans = await Plan.insertMany([
    { name: 'Flexy', serviceType: 'Home-to-Office', tier: 'Flexy', description: 'Flexible booking within 5km', durationDays: 30, price: 2499, pauseDaysAllowed: 5, features: ['Flexible booking', '5km radius', '5 pause days'] },
    { name: 'Hybrid', serviceType: 'Home-to-Office', tier: 'Hybrid', description: 'Alternate days commute', durationDays: 30, price: 1799, pauseDaysAllowed: 3, features: ['MWF or TTS', '3 pause days'] },
    { name: 'Weekday', serviceType: 'Home-to-Office', tier: 'Weekday', description: 'Mon-Fri commute', durationDays: 30, price: 1999, pauseDaysAllowed: 4, features: ['Mon-Fri', '4 pause days'] },
  ]);
  console.log(`Created ${plans.length} plans`);

  // Create routes
  const routes = await Route.insertMany(ROUTES.map((r) => ({
    ...r,
    status: 'ACTIVE',
  })));
  console.log(`Created ${routes.length} routes`);

  // Create 100 drivers in a single batch
  const driverUsersBatch = [];
  for (let i = 0; i < 100; i++) {
    driverUsersBatch.push({
      phone: randomPhone('900001', i),
      password: hashedPassword,
      role: 'Driver',
      status: 'ACTIVE',
    });
  }
  const createdDriverUsers = await User.insertMany(driverUsersBatch);

  const driversBatch = createdDriverUsers.map((user, i) => ({
    userId: user._id,
    name: `Driver ${i + 1}`,
    vehicleNumber: `KA${String(Math.floor(Math.random() * 99)).padStart(2, '0')}AB${String(1000 + i).padStart(4, '0')}`,
    vehicleModel: ['Maruti Swift', 'Hyundai i20', 'Tata Nexon', 'Toyota Innova', 'Mahindra XUV'][i % 5],
    vehicleCapacity: [4, 5, 5, 6, 5][i % 5],
    licenseNumber: `KA${String(2020 + (i % 5)).padStart(4, '0')}${String(100000 + i).padStart(6, '0')}`,
    routeId: routes[i % routes.length]._id,
    status: 'ACTIVE',
    currentLocation: {
      type: 'Point',
      coordinates: randomCoord(CENTER.lng, CENTER.lat, 8),
    },
    isOnline: i < 50,
    isAvailable: i < 50,
  }));
  await Driver.insertMany(driversBatch);
  console.log('Created 100 drivers (first 50 online)');

  // Create 10,000 customers in batches
  const BATCH_SIZE = 1000;
  for (let batch = 0; batch < 10; batch++) {
    const usersBatch = [];
    const customers = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      const idx = batch * BATCH_SIZE + i;
      const phone = randomPhone('900002', idx);
      usersBatch.push({
        phone,
        password: hashedPassword,
        role: 'Customer',
        status: 'ACTIVE',
      });
    }
    const createdUsers = await User.insertMany(usersBatch);

    for (let i = 0; i < createdUsers.length; i++) {
      const idx = batch * BATCH_SIZE + i;
      const pickupCoords = randomCoord(CENTER.lng, CENTER.lat, 10);
      const dropCoords = randomCoord(CENTER.lng, CENTER.lat, 10);
      const homeCoords = randomCoord(CENTER.lng, CENTER.lat, 10);

      customers.push({
        userId: createdUsers[i]._id,
        name: `Customer ${idx + 1}`,
        homeLocation: {
          address: `Home Address ${idx + 1}`,
          type: 'Point',
          coordinates: homeCoords,
        },
        pickupLocation: {
          address: `Pickup ${idx + 1}`,
          type: 'Point',
          coordinates: pickupCoords,
        },
        dropLocation: {
          address: `Drop ${idx + 1}`,
          type: 'Point',
          coordinates: dropCoords,
        },
        status: 'ACTIVE',
      });
    }
    await Customer.insertMany(customers);
    console.log(`  Created ${(batch + 1) * BATCH_SIZE} customers...`);
  }
  console.log('Created 10,000 customers');

  console.log('\n=== SEED COMPLETE ===');
  console.log('Admin: 9000000000 / password123');
  console.log('Drivers: 9000010000-9000010099 / password123');
  console.log('Customers: 9000020000-9000029999 / password123');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
