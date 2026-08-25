const assert = require('node:assert/strict');
const test = require('node:test');
const fc = require('fast-check');
const db = require('./helpers/db');

const { seedDatabase } = require('../config/database');
const authService = require('../services/authService');
const User = require('../models/User');
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

const targetStates = [
  { kind: 'fresh', hasCustomerData: false },
  { kind: 'driver', hasCustomerData: false },
  { kind: 'customer', hasCustomerData: true },
  { kind: 'conflicting-profiles', hasCustomerData: true },
];

function id(value) {
  return value?.toString();
}

function snapshotProfile(customer) {
  if (!customer) return null;
  return {
    id: id(customer._id),
    name: customer.name,
    status: customer.status,
    homeLocation: customer.homeLocation?.toObject?.() || customer.homeLocation,
    pickupLocation: customer.pickupLocation?.toObject?.() || customer.pickupLocation,
    dropLocation: customer.dropLocation?.toObject?.() || customer.dropLocation,
    subscriptionId: id(customer.subscriptionId),
  };
}

async function resetDatabase() {
  // Clear documents, keep indexes — see test/helpers/db.js.
  await db.resetData();
}

async function createRouteAndPlan() {
  const route = await Route.create({
    name: hsrRouteName,
    startLocation: 'HSR Layout, Bangalore',
    endLocation: 'Electronic City, Bangalore',
    stops: [
      { stopName: 'HSR Layout Sector 2', sequenceOrder: 1, location: { type: 'Point', coordinates: [77.6309, 12.9279] } },
      { stopName: 'Electronic City Phase 1', sequenceOrder: 2, location: { type: 'Point', coordinates: [77.6683, 12.8489] } },
    ],
    status: 'ACTIVE',
  });
  const plan = await Plan.create({
    name: 'Exploration Plan',
    serviceType: 'Home-to-Office',
    tier: 'Flexy',
    durationDays: 30,
    price: 1,
    pauseDaysAllowed: 2,
  });
  return { route, plan };
}

async function createDriverProfile(userId, routeId, name) {
  return Driver.create({
    userId,
    name,
    vehicleNumber: `KA01${name === 'Preserved Driver' ? 'PR9876' : 'TG7019'}`,
    vehicleModel: 'Exploration Vehicle',
    vehicleCapacity: 4,
    licenseNumber: `KA-DL-${name === 'Preserved Driver' ? '987654' : '701926'}`,
    routeId,
    status: 'ACTIVE',
  });
}

async function createTargetCustomer(userId, route, plan) {
  const customer = await Customer.create({
    userId,
    name: 'Retained Target Customer',
    status: 'ACTIVE',
    homeLocation: { address: 'Target Home', coordinates: [77.61, 12.91] },
    pickupLocation: { address: 'Target Pickup', coordinates: [77.62, 12.92] },
    dropLocation: { address: 'Target Drop', coordinates: [77.63, 12.93] },
  });
  const subscription = await Subscription.create({
    customerId: customer._id,
    planId: plan._id,
    routeId: route._id,
    startDate: new Date('2025-01-01T00:00:00.000Z'),
    endDate: new Date('2025-02-01T00:00:00.000Z'),
    remainingPauseDays: 2,
    status: 'ACTIVE',
  });
  customer.subscriptionId = subscription._id;
  await customer.save();
  return { customer, subscription };
}

async function prepareState(caseInput) {
  const { route, plan } = await createRouteAndPlan();
  const preservedDriverUser = await User.create({
    phone: preservedDriverPhone,
    password: 'preserved-password',
    role: 'Driver',
    status: 'ACTIVE',
  });
  const preservedDriver = await createDriverProfile(preservedDriverUser._id, route._id, 'Preserved Driver');
  const hsrTrip = await Trip.create({
    routeId: route._id,
    driverId: preservedDriver._id,
    tripDate: new Date('2025-01-15T09:00:00.000Z'),
    status: 'SCHEDULED',
    manifest: [],
  });
  const preservationSnapshot = {
    driverUserId: id(preservedDriverUser._id),
    driverRole: preservedDriverUser.role,
    driverProfileId: id(preservedDriver._id),
    tripId: id(hsrTrip._id),
    tripDriverId: id(hsrTrip.driverId),
  };

  if (caseInput.kind === 'fresh') return { route, plan, preservationSnapshot, retained: null };

  const target = await User.create({
    phone: targetPhone,
    password: 'target-password',
    role: caseInput.kind === 'driver' ? 'Driver' : 'Customer',
    status: 'ACTIVE',
  });
  let retained = null;
  if (caseInput.hasCustomerData) retained = await createTargetCustomer(target._id, route, plan);
  if (caseInput.kind === 'driver' || caseInput.kind === 'conflicting-profiles') {
    await createDriverProfile(target._id, route._id, 'Target Driver');
  }

  return {
    route,
    plan,
    preservationSnapshot,
    retained: retained && {
      profile: snapshotProfile(retained.customer),
      subscriptionId: id(retained.subscription._id),
    },
  };
}

async function observeAfterSeed(retained, preservationSnapshot) {
  const targetUser = await User.findOne({ phone: targetPhone });
  const targetCustomer = targetUser ? await Customer.findOne({ userId: targetUser._id }) : null;
  const targetDrivers = targetUser ? await Driver.find({ userId: targetUser._id }) : [];
  const targetSubscriptions = targetCustomer ? await Subscription.find({ customerId: targetCustomer._id }) : [];
  await OTP.create({
    phone: targetPhone,
    otp: loginOtp,
    purpose: 'LOGIN',
    expiresAt: new Date(Date.now() + 60_000),
  });

  let login;
  try {
    login = { result: await authService.verifyOtp(targetPhone, loginOtp, 'LOGIN') };
  } catch (error) {
    login = { error: { message: error.message, statusCode: error.statusCode } };
  }

  const preservedUser = await User.findOne({ phone: preservedDriverPhone });
  const preservedDriver = preservedUser ? await Driver.findOne({ userId: preservedUser._id }) : null;
  const hsrTrip = await Trip.findById(preservationSnapshot.tripId);

  return {
    target: {
      role: targetUser?.role,
      status: targetUser?.status,
      customer: snapshotProfile(targetCustomer),
      visibleDriverIds: targetDrivers.map((driver) => id(driver._id)),
      subscriptionIds: targetSubscriptions.map((subscription) => id(subscription._id)),
    },
    login,
    preserved: {
      driverRole: preservedUser?.role,
      driverProfileId: id(preservedDriver?._id),
      tripDriverId: id(hsrTrip?.driverId),
    },
    retained,
  };
}

function expectedBehaviorViolations(observation) {
  const violations = [];
  if (observation.target.role !== 'Customer') violations.push(`role=${observation.target.role ?? 'missing'} (expected Customer)`);
  if (observation.target.status !== 'ACTIVE') violations.push(`status=${observation.target.status ?? 'missing'} (expected ACTIVE)`);
  if (!observation.target.customer) violations.push('visible Customer profile is missing');
  if (observation.target.visibleDriverIds.length !== 0) violations.push(`visible Driver profiles=${JSON.stringify(observation.target.visibleDriverIds)}`);
  if (observation.retained) {
    if (JSON.stringify(observation.target.customer) !== JSON.stringify(observation.retained.profile)) {
      violations.push('pre-existing Customer profile fields were not retained');
    }
    if (!observation.target.subscriptionIds.includes(observation.retained.subscriptionId)) {
      violations.push(`pre-existing subscription ${observation.retained.subscriptionId} was not retained`);
    }
  }
  if (observation.login.error) {
    violations.push(`LOGIN OTP rejected: ${observation.login.error.message} (${observation.login.error.statusCode})`);
  } else if (observation.login.result?.user?.role !== 'Customer' || observation.login.result?.user?.phone !== targetPhone) {
    violations.push('LOGIN OTP did not establish the required Customer session');
  }
  return violations;
}

// Feature: customer-otp-account-role-correction, Property 1: Bug Condition - Target Account Is Restored to a Customer
// **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
test('exploration Property 1: every buggy target pre-state converges to an OTP-eligible Customer', async () => {
  const counterexamples = [];

  for (const expectedInput of targetStates) {
    const result = await fc.check(
      fc.asyncProperty(fc.constant(expectedInput), async (caseInput) => {
        await resetDatabase();
        const before = await prepareState(caseInput);
        await seedDatabase('test');
        const observation = await observeAfterSeed(before.retained, before.preservationSnapshot);
        const violations = expectedBehaviorViolations(observation);

        assert.deepEqual(
          observation.preserved,
          {
            driverRole: 'Driver',
            driverProfileId: before.preservationSnapshot.driverProfileId,
            tripDriverId: before.preservationSnapshot.tripDriverId,
          },
          `preservation snapshot changed for ${preservedDriverPhone}`
        );
        assert.deepEqual(
          violations,
          [],
          `case=${caseInput.kind}\nviolations=${violations.join('; ')}\nobservation=${JSON.stringify(observation)}`
        );
      }),
      { numRuns: 1, endOnFailure: true }
    );

    if (result.failed) {
      counterexamples.push({
        input: expectedInput,
        seed: result.seed,
        path: result.counterexamplePath,
        counterexample: result.counterexample,
        error: result.error,
      });
    }
  }

  assert.deepEqual(
    counterexamples,
    [],
    `Property 1 expected-behavior counterexamples on unfixed seed:\n${JSON.stringify(counterexamples, null, 2)}`
  );
});

test.before(async () => { await db.connect(); });

test.after(async () => { await db.disconnect(); });
