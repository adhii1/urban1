const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Customer = require('../models/Customer');
const Driver = require('../models/Driver');
const Plan = require('../models/Plan');
const Route = require('../models/Route');
const Subscription = require('../models/Subscription');
const Trip = require('../models/Trip');
const User = require('../models/User');
const paymentService = require('../services/paymentService');
const { POLICY_CODES, isEligibleOnServiceDate } = require('../services/subscriptionPolicyService');
const { initiatePurchase, verifySubscriptionPayment } = require('../controllers/subscriptionController');

const EARTH_RADIUS_KM = 6371;
let mongoServer;
let createOrderCalls;
let originalCreateOrder;
let originalVerifyPayment;

function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function longitudeForKmAtEquator(distanceKm) {
  return (distanceKm / EARTH_RADIUS_KM) * (180 / Math.PI);
}

function stops() {
  return [
    {
      stopId: 'pickup-stop',
      stopName: 'Pickup Stop',
      sequenceOrder: 10,
      location: { type: 'Point', coordinates: [0, 0] },
    },
    {
      stopId: 'drop-stop',
      stopName: 'Drop Stop',
      sequenceOrder: 20,
      location: { type: 'Point', coordinates: [1, 0] },
    },
  ];
}

function controllerRequest(userId, body) {
  return { user: { id: userId.toString() }, body };
}

function invoke(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: undefined,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ statusCode: this.statusCode, body });
      },
    };
    handler(req, res, reject);
  });
}

async function createCustomer({ pickupCoordinates = [0, 0], dropCoordinates = [1, 0] } = {}) {
  return Customer.create({
    userId: new mongoose.Types.ObjectId(),
    name: 'Integration Customer',
    pickupLocation: { type: 'Point', coordinates: pickupCoordinates },
    dropLocation: { type: 'Point', coordinates: dropCoordinates },
  });
}

async function createPlan({ tier = 'Standard', serviceType = 'Stop-to-Stop' } = {}) {
  return Plan.create({
    name: `${tier} ${serviceType} plan`,
    tier,
    serviceType,
    durationDays: 0,
    price: 199,
    bookingRules: { isSharedRide: true, useManagedStops: true },
  });
}

async function createRoute(overrides = {}) {
  return Route.create({
    name: 'Integration route',
    startLocation: 'Start',
    endLocation: 'End',
    status: 'ACTIVE',
    stops: stops(),
    ...overrides,
  });
}

function purchaseBody(plan, route, overrides = {}) {
  return {
    planId: plan._id.toString(),
    routeId: route._id.toString(),
    startDate: tomorrow().toISOString(),
    pickupStopId: 'pickup-stop',
    dropStopId: 'drop-stop',
    ...overrides,
  };
}

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  originalCreateOrder = paymentService.createOrder;
  originalVerifyPayment = paymentService.verifyPayment;
  paymentService.createOrder = async () => {
    createOrderCalls += 1;
    return { orderId: `order_${createOrderCalls}` };
  };
  paymentService.verifyPayment = async () => ({ verified: true });
});

test.beforeEach(async () => {
  createOrderCalls = 0;
  await mongoose.connection.db.dropDatabase();
});

test.after(async () => {
  paymentService.createOrder = originalCreateOrder;
  paymentService.verifyPayment = originalVerifyPayment;
  await mongoose.disconnect();
  await mongoServer.stop();
});

test('rejects a Home-to-Office distance overflow before payment or subscription persistence', async () => {
  const customer = await createCustomer({
    pickupCoordinates: [longitudeForKmAtEquator(5.001), 0],
  });
  const plan = await createPlan({ tier: 'Hybrid', serviceType: 'Home-to-Office' });
  const route = await createRoute();

  await assert.rejects(
    () => invoke(initiatePurchase, controllerRequest(customer.userId, purchaseBody(plan, route, {
      selectedWeekdays: [1, 3, 5],
    }))),
    (error) => {
      assert.equal(error.details.code, POLICY_CODES.PICKUP_STOP_TOO_FAR);
      return true;
    }
  );
  assert.equal(createOrderCalls, 0);
  assert.equal(await Subscription.countDocuments(), 0);
});

test('rejects invalid Hybrid weekdays before payment or subscription persistence', async () => {
  const customer = await createCustomer();
  const plan = await createPlan({ tier: 'Hybrid', serviceType: 'Home-to-Office' });
  const route = await createRoute();

  await assert.rejects(
    () => invoke(initiatePurchase, controllerRequest(customer.userId, purchaseBody(plan, route, {
      selectedWeekdays: [1, 1, 6],
    }))),
    (error) => {
      assert.equal(error.details.code, POLICY_CODES.INVALID_HYBRID_WEEKDAYS);
      return true;
    }
  );
  assert.equal(createOrderCalls, 0);
  assert.equal(await Subscription.countDocuments(), 0);
});

test('rejects inactive, deleted, and unknown-stop selections before payment', async () => {
  const customer = await createCustomer();
  const plan = await createPlan();
  const cases = [
    {
      name: 'inactive route',
      route: await createRoute({ status: 'INACTIVE' }),
      body: {},
      code: POLICY_CODES.ROUTE_NOT_ACTIVE,
    },
    {
      name: 'deleted route',
      route: await createRoute({ isDeleted: true }),
      body: {},
      code: POLICY_CODES.ROUTE_NOT_ACTIVE,
    },
    {
      name: 'unknown pickup stop',
      route: await createRoute(),
      body: { pickupStopId: 'not-on-route' },
      code: POLICY_CODES.PICKUP_STOP_NOT_ON_ROUTE,
    },
  ];

  for (const scenario of cases) {
    await assert.rejects(
      () => invoke(initiatePurchase, controllerRequest(
        customer.userId,
        purchaseBody(plan, scenario.route, scenario.body)
      )),
      (error) => {
        assert.equal(error.details.code, scenario.code, scenario.name);
        return true;
      }
    );
  }
  assert.equal(createOrderCalls, 0);
  assert.equal(await Subscription.countDocuments(), 0);
});

test('persists durable Stop-to-Stop selections and creates an eligible manifest on payment activation', async () => {
  const customer = await createCustomer();
  const plan = await createPlan();
  const driverUser = await User.create({
    phone: '9000000001',
    password: 'test-password',
    role: 'Driver',
    status: 'ACTIVE',
  });
  const driver = await Driver.create({
    userId: driverUser._id,
    name: 'Assigned Driver',
    vehicleNumber: 'KA01AB1234',
    vehicleModel: 'Test Van',
    vehicleCapacity: 6,
    licenseNumber: 'LICENSE-1',
    status: 'ACTIVE',
  });
  const route = await createRoute({ assignedDriver: driver._id });

  const purchase = await invoke(
    initiatePurchase,
    controllerRequest(customer.userId, purchaseBody(plan, route))
  );
  assert.equal(purchase.statusCode, 201);
  assert.equal(createOrderCalls, 1);

  const subscription = await Subscription.findById(purchase.body.data.subscriptionId);
  assert.equal(subscription.status, 'PENDING_PAYMENT');
  assert.equal(subscription.pickupStopId, 'pickup-stop');
  assert.equal(subscription.dropStopId, 'drop-stop');
  assert.equal(subscription.pickupStopSequence, 10);
  assert.equal(subscription.dropStopSequence, 20);

  const activation = await invoke(verifySubscriptionPayment, controllerRequest(customer.userId, {
    subscriptionId: subscription._id.toString(),
    orderId: purchase.body.data.orderId,
    paymentId: 'payment_1',
    signature: 'signature_1',
  }));
  assert.equal(activation.statusCode, 200);
  assert.equal(activation.body.data.status, 'ACTIVE');

  const activeSubscription = await Subscription.findById(subscription._id);
  assert.equal(isEligibleOnServiceDate({
    subscription: activeSubscription,
    plan,
    serviceDate: activeSubscription.startDate,
  }), true);

  const trip = await Trip.findOne({ routeId: route._id });
  assert.ok(trip, 'an eligible Stop-to-Stop subscription should produce a scheduled manifest');
  assert.equal(trip.driverId.toString(), driver._id.toString());
  assert.equal(trip.manifest.length, 1);
  assert.equal(trip.manifest[0].subscriptionId.toString(), subscription._id.toString());
  assert.equal(trip.manifest[0].pickupStop.stopId, 'pickup-stop');
  assert.equal(trip.manifest[0].pickupStop.sequenceOrder, 10);
  assert.equal(trip.manifest[0].dropStop.stopId, 'drop-stop');
  assert.equal(trip.manifest[0].dropStop.sequenceOrder, 20);
  assert.equal(trip.manifest[0].status, 'PENDING');
});
