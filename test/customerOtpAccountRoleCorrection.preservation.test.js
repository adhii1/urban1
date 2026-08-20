const assert = require('node:assert/strict');
const test = require('node:test');
const fc = require('fast-check');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { seedDatabase } = require('../config/database');
const authService = require('../services/authService');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Customer = require('../models/Customer');
const Driver = require('../models/Driver');
const OTP = require('../models/OTP');
const Plan = require('../models/Plan');
const Route = require('../models/Route');
const Subscription = require('../models/Subscription');
const Trip = require('../models/Trip');

const targetPhone = '7019268918';
const preservedDriverPhone = '9876543210';
const hsrRouteName = 'HSR Layout - Electronic City';
const loginOtp = '654321';
let mongoServer;

const id = (value) => value?.toString();
const plain = (value) => value?.toObject?.() || value;

function customerSnapshot(customer) {
  if (!customer) return null;
  const value = plain(customer);
  return {
    id: id(value._id), name: value.name, status: value.status,
    homeLocation: value.homeLocation, pickupLocation: value.pickupLocation,
    dropLocation: value.dropLocation, subscriptionId: id(value.subscriptionId),
  };
}

function driverSnapshot(driver) {
  if (!driver) return null;
  const value = plain(driver);
  return {
    id: id(value._id), name: value.name, status: value.status,
    vehicleNumber: value.vehicleNumber, vehicleModel: value.vehicleModel,
    vehicleCapacity: value.vehicleCapacity, licenseNumber: value.licenseNumber,
    routeId: id(value.routeId),
  };
}

function subscriptionSnapshot(subscription) {
  const value = plain(subscription);
  return {
    id: id(value._id), customerId: id(value.customerId), planId: id(value.planId),
    routeId: id(value.routeId), startDate: value.startDate.toISOString(),
    endDate: value.endDate.toISOString(), remainingPauseDays: value.remainingPauseDays,
    status: value.status,
  };
}

async function resetDatabase() {
  await mongoose.connection.db.dropDatabase();
  await Promise.all([User, Admin, Customer, Driver, OTP, Plan, Route, Subscription, Trip].map((model) => model.syncIndexes()));
}

async function routeAndPlan() {
  const route = await Route.create({
    name: hsrRouteName, startLocation: 'HSR Layout, Bangalore', endLocation: 'Electronic City, Bangalore',
    stops: [
      { stopName: 'HSR Layout Sector 2', sequenceOrder: 1, location: { type: 'Point', coordinates: [77.6309, 12.9279] } },
      { stopName: 'Electronic City Phase 1', sequenceOrder: 2, location: { type: 'Point', coordinates: [77.6683, 12.8489] } },
    ], status: 'ACTIVE',
  });
  const plan = await Plan.create({ name: 'Preservation Plan', serviceType: 'Home-to-Office', tier: 'Flexy', durationDays: 30, price: 1, pauseDaysAllowed: 2 });
  return { route, plan };
}

async function createDriver(userId, routeId, suffix) {
  return Driver.create({
    userId, name: `Driver ${suffix}`, vehicleNumber: `KA01PR${suffix}`,
    vehicleModel: 'Preservation Vehicle', vehicleCapacity: 4, licenseNumber: `KA-DL-${suffix}`,
    routeId, status: 'ACTIVE',
  });
}

async function createCustomer(userId, route, plan, name) {
  const customer = await Customer.create({
    userId, name, status: 'ACTIVE',
    homeLocation: { address: `${name} Home`, coordinates: [77.61, 12.91] },
    pickupLocation: { address: `${name} Pickup`, coordinates: [77.62, 12.92] },
    dropLocation: { address: `${name} Drop`, coordinates: [77.63, 12.93] },
  });
  const subscription = await Subscription.create({
    customerId: customer._id, planId: plan._id, routeId: route._id,
    startDate: new Date('2025-01-01T00:00:00.000Z'), endDate: new Date('2025-02-01T00:00:00.000Z'),
    remainingPauseDays: 2, status: 'ACTIVE',
  });
  customer.subscriptionId = subscription._id;
  await customer.save();
  return { customer, subscription };
}

async function createNonTargetFixture(phonePrefix, customerName) {
  const { route, plan } = await routeAndPlan();
  const preservedUser = await User.create({ phone: preservedDriverPhone, password: 'driver-password', role: 'Driver', status: 'ACTIVE' });
  const preservedDriver = await createDriver(preservedUser._id, route._id, '9876');
  const trip = await Trip.create({ routeId: route._id, driverId: preservedDriver._id, tripDate: new Date('2025-01-15T09:00:00.000Z'), status: 'SCHEDULED', manifest: [] });
  const customerUser = await User.create({ phone: `${phonePrefix}1`, password: 'customer-password', role: 'Customer', status: 'ACTIVE' });
  await createCustomer(customerUser._id, route, plan, customerName);
  const driverUser = await User.create({ phone: `${phonePrefix}2`, password: 'other-driver-password', role: 'Driver', status: 'ACTIVE' });
  await createDriver(driverUser._id, route._id, '8123');
  const adminUser = await User.create({ phone: `${phonePrefix}3`, password: 'admin-password', role: 'Admin', status: 'ACTIVE' });
  await Admin.create({ userId: adminUser._id, name: 'Preservation Admin', permissions: ['MANAGE_SETTINGS'], role: 'Operations Admin', status: 'ACTIVE' });
  return {
    phones: { customer: customerUser.phone, driver: driverUser.phone, admin: adminUser.phone },
    preserved: { userId: id(preservedUser._id), role: preservedUser.role, profileId: id(preservedDriver._id), tripId: id(trip._id), tripDriverId: id(trip.driverId) },
  };
}

async function nonTargetSnapshot(phones) {
  const [customerUser, driverUser, adminUser] = await Promise.all([User.findOne({ phone: phones.customer }), User.findOne({ phone: phones.driver }), User.findOne({ phone: phones.admin })]);
  const [customer, driver, admin] = await Promise.all([Customer.findOne({ userId: customerUser._id }), Driver.findOne({ userId: driverUser._id }), Admin.findOne({ userId: adminUser._id })]);
  const subscriptions = await Subscription.find({ customerId: customer._id });
  return {
    customer: { user: { id: id(customerUser._id), phone: customerUser.phone, role: customerUser.role, status: customerUser.status }, profile: customerSnapshot(customer), subscriptions: subscriptions.map(subscriptionSnapshot) },
    driver: { user: { id: id(driverUser._id), phone: driverUser.phone, role: driverUser.role, status: driverUser.status }, profile: driverSnapshot(driver) },
    admin: { user: { id: id(adminUser._id), phone: adminUser.phone, role: adminUser.role, status: adminUser.status }, profile: { id: id(admin._id), name: admin.name, permissions: admin.permissions, role: admin.role, status: admin.status } },
  };
}

async function preservedSnapshot(preserved) {
  const user = await User.findOne({ phone: preservedDriverPhone });
  const driver = await Driver.findOne({ userId: user._id });
  const trip = await Trip.findById(preserved.tripId);
  return { userId: id(user._id), role: user.role, profileId: id(driver._id), tripId: id(trip._id), tripDriverId: id(trip.driverId) };
}

async function assertCustomerOtpRejected(phone) {
  await OTP.create({ phone, otp: loginOtp, purpose: 'LOGIN', expiresAt: new Date(Date.now() + 60_000) });
  await assert.rejects(() => authService.verifyOtp(phone, loginOtp, 'LOGIN'), (error) => error.message === 'Please use password login for this account.' && error.statusCode === 400);
}

async function createAlreadyCorrectTarget() {
  const { route, plan } = await routeAndPlan();
  const user = await User.create({ phone: targetPhone, password: 'target-password', role: 'Customer', status: 'ACTIVE' });
  const { customer, subscription } = await createCustomer(user._id, route, plan, 'Already Correct Target');
  return {
    user: { id: id(user._id), phone: user.phone, role: user.role, status: user.status },
    customer: customerSnapshot(customer), subscriptions: [subscriptionSnapshot(subscription)], visibleDriverIds: [],
  };
}

async function targetSnapshot() {
  const user = await User.findOne({ phone: targetPhone });
  const customer = user && await Customer.findOne({ userId: user._id });
  const [subscriptions, drivers] = await Promise.all([
    customer ? Subscription.find({ customerId: customer._id }) : [],
    user ? Driver.find({ userId: user._id }) : [],
  ]);
  return {
    user: user && { id: id(user._id), phone: user.phone, role: user.role, status: user.status },
    customer: customerSnapshot(customer), subscriptions: subscriptions.map(subscriptionSnapshot), visibleDriverIds: drivers.map((driver) => id(driver._id)),
  };
}

const baselineInput = fc.record({
  phonePrefix: fc.integer({ min: 810000000, max: 819999999 }).map(String),
  customerName: fc.stringMatching(/^[A-Za-z]{1,12}$/),
});

// Feature: customer-otp-account-role-correction, Property 2: Preservation - Non-Target Accounts and Driver Trip Stay Unchanged
// **Validates: Requirements 3.1, 3.2, 3.3**
test('Property 2 baseline: non-target Driver/Admin OTP rejection and data stay unchanged across seed runs', async () => {
  await fc.assert(fc.asyncProperty(baselineInput, async (input) => {
    await resetDatabase();
    const fixture = await createNonTargetFixture(input.phonePrefix, input.customerName);
    const beforeRecords = await nonTargetSnapshot(fixture.phones);
    const beforePreserved = await preservedSnapshot(fixture.preserved);
    assert.deepEqual(beforePreserved, fixture.preserved);

    await seedDatabase('test');
    assert.deepEqual(await nonTargetSnapshot(fixture.phones), beforeRecords);
    assert.deepEqual(await preservedSnapshot(fixture.preserved), beforePreserved);
    await seedDatabase('test');
    assert.deepEqual(await nonTargetSnapshot(fixture.phones), beforeRecords);
    assert.deepEqual(await preservedSnapshot(fixture.preserved), beforePreserved);

    await assertCustomerOtpRejected(preservedDriverPhone);
    await assertCustomerOtpRejected(fixture.phones.driver);
    await assertCustomerOtpRejected(fixture.phones.admin);
  }), { numRuns: 8 });
});

// Feature: customer-otp-account-role-correction, Property 2: Preservation - Already-correct target state is idempotent
// **Validates: Requirements 3.3**
test('Property 2 baseline: an already-correct target Customer is unchanged by repeated seed runs', async () => {
  await fc.assert(fc.asyncProperty(fc.constant(undefined), async () => {
    await resetDatabase();
    const before = await createAlreadyCorrectTarget();
    await seedDatabase('test');
    assert.deepEqual(await targetSnapshot(), before, 'first seed must preserve the already-correct target Customer state');
    await seedDatabase('test');
    assert.deepEqual(await targetSnapshot(), before, 'second seed must neither reset nor duplicate target Customer data');
  }), { numRuns: 1, endOnFailure: true });
});

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});
