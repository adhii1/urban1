const User = require('../models/User');
const Driver = require('../models/Driver');
const Customer = require('../models/Customer');
const Trip = require('../models/Trip');
const Route = require('../models/Route');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const PauseRequest = require('../models/PauseRequest');
const Admin = require('../models/Admin');
const Settings = require('../models/Settings');
const OperationalException = require('../models/OperationalException');
const Area = require('../models/Area');
const {
  applyDriverChange,
  reconcileStopChange,
  resolveManifestConflict,
} = require('../services/routeReconciliationService');
const { hashPassword } = require('../utils/passwordHelper');
const { buildTripManifest } = require('../utils/geoHelper');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { toTripView } = require('../utils/tripView');
const { NotFoundError, ValidationError } = require('../utils/AppError');

// Dashboard
const getDashboard = asyncWrapper(async (req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [totalCustomers, totalDrivers, activeTrips, completedTrips, cancelledTrips, activeSubscriptions] = await Promise.all([
    Customer.countDocuments({ isDeleted: false }),
    Driver.countDocuments({ isDeleted: false }),
    Trip.countDocuments({ status: 'IN_PROGRESS', serviceDate: { $gte: todayStart, $lte: todayEnd }, isDeleted: false }),
    Trip.countDocuments({ status: 'COMPLETED', serviceDate: { $gte: todayStart, $lte: todayEnd }, isDeleted: false }),
    Trip.countDocuments({ status: 'CANCELLED', serviceDate: { $gte: todayStart, $lte: todayEnd }, isDeleted: false }),
    Subscription.countDocuments({ status: 'ACTIVE', isDeleted: false }),
  ]);

  return res.status(200).json(formatResponse('Dashboard stats aggregated successfully.', {
    totalCustomers,
    totalDrivers,
    activeTrips,
    completedTrips,
    cancelledTrips,
    activeSubscriptions,
  }));
});

// Drivers CRUD
const getDrivers = asyncWrapper(async (req, res) => {
  const drivers = await Driver.find().populate('userId', 'phone status').populate('routeId', 'name').populate('areaId', 'name');
  return res.status(200).json(formatResponse('Drivers listed successfully.', drivers));
});

const getDriverById = asyncWrapper(async (req, res) => {
  const driver = await Driver.findById(req.params.id).populate('routeId');
  if (!driver) throw new NotFoundError('Driver');
  return res.status(200).json(formatResponse('Driver profile retrieved.', driver));
});

const createDriver = asyncWrapper(async (req, res) => {
  const { phone, password, name, vehicleNumber, vehicleModel, vehicleCapacity, licenseNumber, routeId, areaId } = req.body;

  if (!password) throw new ValidationError('Password is required');

  const existingUser = await User.findOne({ phone });
  if (existingUser) throw new ValidationError('Phone number already registered');

  const hashedPassword = await hashPassword(password);
  const user = await User.create({ phone, password: hashedPassword, role: 'Driver', status: 'ACTIVE' });

  const driver = await Driver.create({
    userId: user._id,
    name,
    vehicleNumber,
    vehicleModel,
    vehicleCapacity: vehicleCapacity || 6,
    licenseNumber,
    routeId,
    areaId: areaId || undefined,
  });

  return res.status(201).json(formatResponse('Driver created successfully.', driver));
});

const updateDriver = asyncWrapper(async (req, res) => {
  const { name, vehicleNumber, vehicleModel, vehicleCapacity, licenseNumber, routeId, areaId, status } = req.body;
  const driver = await Driver.findById(req.params.id);
  if (!driver) throw new NotFoundError('Driver');

  if (name !== undefined) driver.name = name;
  if (vehicleNumber !== undefined) driver.vehicleNumber = vehicleNumber;
  if (vehicleModel !== undefined) driver.vehicleModel = vehicleModel;
  if (vehicleCapacity !== undefined) driver.vehicleCapacity = vehicleCapacity;
  if (licenseNumber !== undefined) driver.licenseNumber = licenseNumber;
  if (routeId !== undefined) driver.routeId = routeId;
  if (areaId !== undefined) driver.areaId = areaId || null;
  if (status !== undefined) driver.status = status;

  await driver.save();
  return res.status(200).json(formatResponse('Driver updated successfully.', driver));
});

const deleteDriver = asyncWrapper(async (req, res) => {
  const driver = await Driver.findById(req.params.id);
  if (!driver) throw new NotFoundError('Driver');

  driver.isDeleted = true;
  driver.deletedAt = new Date();
  driver.deletedBy = req.user.id;
  await driver.save();

  const user = await User.findById(driver.userId);
  if (user) {
    user.isDeleted = true;
    await user.save();
  }

  return res.status(200).json(formatResponse('Driver deleted successfully.'));
});

// Customers CRUD
const getCustomers = asyncWrapper(async (req, res) => {
  const customers = await Customer.find().populate('userId', 'phone status').populate('subscriptionId');
  return res.status(200).json(formatResponse('Customers listed successfully.', customers));
});

const getCustomerById = asyncWrapper(async (req, res) => {
  const customer = await Customer.findById(req.params.id).populate('subscriptionId');
  if (!customer) throw new NotFoundError('Customer');
  return res.status(200).json(formatResponse('Customer profile retrieved.', customer));
});

const createCustomer = asyncWrapper(async (req, res) => {
  const { phone, password, name, homeLocation, pickupLocation, dropLocation } = req.body;

  if (!password) throw new ValidationError('Password is required');

  const existingUser = await User.findOne({ phone });
  if (existingUser) throw new ValidationError('Phone number already registered');

  const hashedPassword = await hashPassword(password);
  const user = await User.create({ phone, password: hashedPassword, role: 'Customer', status: 'ACTIVE' });

  const customer = await Customer.create({
    userId: user._id,
    name,
    homeLocation,
    pickupLocation,
    dropLocation,
  });

  return res.status(201).json(formatResponse('Customer created successfully.', customer));
});

const updateCustomer = asyncWrapper(async (req, res) => {
  const { name, homeLocation, pickupLocation, dropLocation, status } = req.body;
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw new NotFoundError('Customer');

  if (name !== undefined) customer.name = name;
  if (homeLocation !== undefined) customer.homeLocation = homeLocation;
  if (pickupLocation !== undefined) customer.pickupLocation = pickupLocation;
  if (dropLocation !== undefined) customer.dropLocation = dropLocation;
  if (status !== undefined) customer.status = status;

  await customer.save();
  return res.status(200).json(formatResponse('Customer updated successfully.', customer));
});

const deleteCustomer = asyncWrapper(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw new NotFoundError('Customer');

  customer.isDeleted = true;
  customer.deletedAt = new Date();
  customer.deletedBy = req.user.id;
  await customer.save();

  const user = await User.findById(customer.userId);
  if (user) {
    user.isDeleted = true;
    await user.save();
  }

  return res.status(200).json(formatResponse('Customer deleted successfully.'));
});

const banCustomer = asyncWrapper(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw new NotFoundError('Customer');

  customer.status = 'BANNED';
  await customer.save();

  const user = await User.findById(customer.userId);
  if (user) {
    user.status = 'SUSPENDED';
    await user.save();
  }

  return res.status(200).json(formatResponse('Customer banned successfully.', customer));
});

// Trips CRUD
const getTrips = asyncWrapper(async (req, res) => {
  const filter = {};
  if (req.query.future === 'true') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Legacy trips do not have serviceDate; retain their planned-date view.
    filter.$or = [
      { serviceDate: { $gte: today } },
      { serviceDate: { $exists: false }, tripDate: { $gte: today } },
    ];
  }
  if (req.query.status) filter.status = req.query.status;

  const trips = await Trip.find(filter)
    .populate('driverId', 'name')
    .populate('passengers.customerId', 'name')
    .sort({ serviceDate: 1 })
    .lean();
  return res.status(200).json(formatResponse('Trips listed successfully.', trips.map((t) => toTripView(t))));
});

const getTripById = asyncWrapper(async (req, res) => {
  const trip = await Trip.findById(req.params.id)
    .populate('driverId', 'name vehicleNumber')
    .populate('passengers.customerId', 'name pickupLocation dropLocation')
    .lean();
  if (!trip) throw new NotFoundError('Trip');
  return res.status(200).json(formatResponse('Trip details retrieved.', toTripView(trip)));
});

const createTrip = asyncWrapper(async (req, res) => {
  const { routeId, driverId, tripDate, customerIds } = req.body;

  const driver = await Driver.findById(driverId);
  if (!driver) throw new NotFoundError('Driver');

  if (customerIds && customerIds.length > driver.vehicleCapacity) {
    throw new ValidationError('Customer count exceeds vehicle capacity');
  }

  const manifest = await buildTripManifest(customerIds || [], routeId);

  const trip = await Trip.create({
    routeId,
    driverId,
    tripDate,
    manifest,
  });

  return res.status(201).json(formatResponse('Trip created successfully.', trip));
});

const updateTrip = asyncWrapper(async (req, res) => {
  const { routeId, driverId, tripDate, status, customers } = req.body;
  const trip = await Trip.findById(req.params.id);
  if (!trip) throw new NotFoundError('Trip');

  // Validate status transitions
  const validTransitions = {
    SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  };

  if (status !== undefined) {
    if (!validTransitions[trip.status] || !validTransitions[trip.status].includes(status)) {
      throw new ValidationError(`Cannot transition trip from "${trip.status}" to "${status}".`);
    }
    trip.status = status;
    if (status === 'COMPLETED') {
      trip.completedAt = new Date();
    }
  }

  if (routeId !== undefined) trip.routeId = routeId;
  if (driverId !== undefined) trip.driverId = driverId;
  if (tripDate !== undefined) trip.tripDate = tripDate;
  if (customers !== undefined) {
    trip.manifest = await buildTripManifest(customers, routeId || trip.routeId);
  }

  await trip.save();
  return res.status(200).json(formatResponse('Trip updated successfully.', trip));
});

const deleteTrip = asyncWrapper(async (req, res) => {
  const trip = await Trip.findById(req.params.id);
  if (!trip) throw new NotFoundError('Trip');

  trip.isDeleted = true;
  trip.deletedAt = new Date();
  trip.deletedBy = req.user.id;
  await trip.save();

  return res.status(200).json(formatResponse('Trip deleted successfully.'));
});

const reassignTrip = asyncWrapper(async (req, res) => {
  const { driverId, customers } = req.body;
  const trip = await Trip.findById(req.params.id);
  if (!trip) throw new NotFoundError('Trip');

  // Only SCHEDULED trips can be reassigned
  if (trip.status !== 'SCHEDULED') {
    throw new ValidationError(`Cannot reassign trip with status "${trip.status}". Only SCHEDULED trips can be reassigned.`);
  }

  if (driverId !== undefined) {
    const driver = await Driver.findById(driverId);
    if (!driver) throw new NotFoundError('Driver');
    if (driver.status !== 'ACTIVE') throw new ValidationError('Driver is not active');
    trip.driverId = driverId;
  }
  if (customers !== undefined) {
    trip.manifest = await buildTripManifest(customers, trip.routeId);
  }

  await trip.save();
  return res.status(200).json(formatResponse('Trip reassigned successfully.', trip));
});

// Routes CRUD
const getRoutes = asyncWrapper(async (req, res) => {
  const routes = await Route.find().populate('assignedDriver', 'name');
  return res.status(200).json(formatResponse('Routes listed successfully.', routes));
});

const createRoute = asyncWrapper(async (req, res) => {
  const { name, startLocation, endLocation, stops, assignedDriver } = req.body;
  const route = await Route.create({ name, startLocation, endLocation, stops, assignedDriver });
  // Link driver to this route
  if (assignedDriver) {
    await Driver.findByIdAndUpdate(assignedDriver, { routeId: route._id });
  }
  return res.status(201).json(formatResponse('Route created successfully.', route));
});

const updateRoute = asyncWrapper(async (req, res) => {
  const { name, startLocation, endLocation, stops, assignedDriver, status } = req.body;
  const route = await Route.findById(req.params.id);
  if (!route) throw new NotFoundError('Route');

  const previousRoute = route.toObject();
  const driverChanged = assignedDriver !== undefined
    && String(route.assignedDriver || '') !== String(assignedDriver || '');

  // A configured route driver must be active before the route or any future
  // trip is updated. Clearing the assignment remains supported.
  if (driverChanged && assignedDriver) {
    const nextDriver = await Driver.findOne({ _id: assignedDriver, status: 'ACTIVE' });
    if (!nextDriver) throw new ValidationError('The assigned route driver must be active.');
  }

  if (name !== undefined) route.name = name;
  if (startLocation !== undefined) route.startLocation = startLocation;
  if (endLocation !== undefined) route.endLocation = endLocation;
  if (stops !== undefined) route.stops = stops;
  if (driverChanged) {
    if (route.assignedDriver) {
      await Driver.findByIdAndUpdate(route.assignedDriver, { $unset: { routeId: 1 } });
    }
    route.assignedDriver = assignedDriver || null;
    if (assignedDriver) {
      await Driver.findByIdAndUpdate(assignedDriver, { routeId: route._id });
    }
  }
  if (status !== undefined) route.status = status;

  await route.save();

  if (driverChanged) {
    await applyDriverChange(route._id, route.assignedDriver);
  }
  if (stops !== undefined || status !== undefined) {
    await reconcileStopChange(route._id, { route: route.toObject(), previousRoute });
  }

  return res.status(200).json(formatResponse('Route updated successfully.', route));
});

const deleteRoute = asyncWrapper(async (req, res) => {
  const route = await Route.findById(req.params.id);
  if (!route) throw new NotFoundError('Route');

  route.isDeleted = true;
  await route.save();
  await reconcileStopChange(route._id, { route: route.toObject() });

  return res.status(200).json(formatResponse('Route deleted successfully.'));
});

function buildReplacementStopOptions(route) {
  if (!route || route.status !== 'ACTIVE' || route.isDeleted) return null;

  const stops = [...(route.stops || [])]
    .filter((stop) => stop.stopId)
    .sort((left, right) => left.sequenceOrder - right.sequenceOrder)
    .map((stop) => ({
      stopId: stop.stopId,
      stopName: stop.stopName,
      sequenceOrder: stop.sequenceOrder,
    }));

  return {
    pickupStops: stops.filter((pickupStop) => stops.some(
      (dropStop) => pickupStop.sequenceOrder < dropStop.sequenceOrder
    )),
    dropStopsByPickupStopId: Object.fromEntries(stops.map((pickupStop) => [
      pickupStop.stopId,
      stops.filter((dropStop) => pickupStop.sequenceOrder < dropStop.sequenceOrder),
    ])),
  };
}

const getOperationalExceptions = asyncWrapper(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  else filter.status = 'OPEN';
  if (req.query.type) filter.type = req.query.type;
  if (req.query.routeId) filter.routeId = req.query.routeId;

  const exceptions = await OperationalException.find(filter)
    .populate('routeId', 'name status isDeleted stops')
    .populate('tripId', 'serviceDate tripDate status')
    .populate('subscriptionId', 'pickupStopId dropStopId status')
    .sort({ serviceDate: 1, createdAt: -1 })
    .lean();

  const observableExceptions = exceptions.map((exception) => ({
    ...exception,
    // The console receives only choices that are currently active, distinct,
    // and in forward route order. Resolution remains validated server-side.
    replacementStopOptions: exception.type === 'ROUTE_CHANGE_CONFLICT'
      ? buildReplacementStopOptions(exception.routeId)
      : null,
  }));
  return res.status(200).json(formatResponse('Operational exceptions listed successfully.', observableExceptions));
});

const resolveOperationalException = asyncWrapper(async (req, res) => {
  const result = await resolveManifestConflict({
    exceptionId: req.params.id,
    pickupStopId: req.body.pickupStopId,
    dropStopId: req.body.dropStopId,
    effectiveDate: req.body.effectiveDate,
    notes: req.body.notes,
    resolvedBy: req.user.id,
  });
  return res.status(200).json(formatResponse('Route-change conflict resolved successfully.', result));
});

// Subscriptions
const getSubscriptions = asyncWrapper(async (req, res) => {
  const subscriptions = await Subscription.find()
    .populate('customerId', 'name')
    .populate('planId', 'name serviceType tier price')
    .populate('routeId', 'name startLocation endLocation')
    .populate('assignedDriverId', 'name vehicleNumber vehicleCapacity')
    .populate('assignedAreaId', 'name')
    .sort({ createdAt: -1 });
  return res.status(200).json(formatResponse('Subscriptions listed successfully.', subscriptions));
});

const createSubscription = asyncWrapper(async (req, res) => {
  const { customerId, planId, routeId, startDate } = req.body;

  const plan = await Plan.findById(planId);
  if (!plan) throw new NotFoundError('Plan');

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + plan.durationDays);

  const subscription = await Subscription.create({
    customerId,
    planId,
    routeId,
    startDate,
    endDate,
    remainingPauseDays: plan.pauseDaysAllowed,
    status: 'ACTIVE',
  });

  await Customer.findByIdAndUpdate(customerId, { subscriptionId: subscription._id });

  return res.status(201).json(formatResponse('Subscription created successfully.', subscription));
});

const updateSubscription = asyncWrapper(async (req, res) => {
  const { planId, routeId, startDate, endDate, status } = req.body;
  const update = {};
  if (planId) update.planId = planId;
  if (routeId) update.routeId = routeId;
  if (startDate) update.startDate = startDate;
  if (endDate) update.endDate = endDate;
  if (status) update.status = status;

  const subscription = await Subscription.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!subscription) throw new NotFoundError('Subscription');
  return res.status(200).json(formatResponse('Subscription updated successfully.', subscription));
});

const pauseSubscription = asyncWrapper(async (req, res) => {
  const subscription = await Subscription.findById(req.params.id);
  if (!subscription) throw new NotFoundError('Subscription');
  if (subscription.status !== 'ACTIVE') throw new ValidationError('Only active subscriptions can be paused');

  subscription.status = 'PAUSED';
  if (subscription.remainingPauseDays > 0) {
    subscription.remainingPauseDays -= 1;
  }
  await subscription.save();

  return res.status(200).json(formatResponse('Subscription paused successfully.', subscription));
});

const resumeSubscription = asyncWrapper(async (req, res) => {
  const subscription = await Subscription.findById(req.params.id);
  if (!subscription) throw new NotFoundError('Subscription');
  if (subscription.status !== 'PAUSED') throw new ValidationError('Only paused subscriptions can be resumed');

  subscription.status = 'ACTIVE';
  await subscription.save();

  return res.status(200).json(formatResponse('Subscription resumed successfully.', subscription));
});

const cancelSubscription = asyncWrapper(async (req, res) => {
  const subscription = await Subscription.findById(req.params.id);
  if (!subscription) throw new NotFoundError('Subscription');
  if (subscription.status === 'CANCELLED') throw new ValidationError('Subscription is already cancelled');

  subscription.status = 'CANCELLED';
  await subscription.save();

  // Unlink from customer
  if (subscription.customerId) {
    const Customer = require('../models/Customer');
    await Customer.findByIdAndUpdate(subscription.customerId, { $unset: { subscriptionId: 1 } });
  }

  return res.status(200).json(formatResponse('Subscription cancelled successfully.', subscription));
});

// Plan Management
const getPlans = asyncWrapper(async (req, res) => {
  const plans = await Plan.find().sort({ serviceType: 1, tier: 1 });
  return res.status(200).json(formatResponse('Plans listed successfully.', plans));
});

const createPlan = asyncWrapper(async (req, res) => {
  const { name, serviceType, tier, description, durationDays, price, pauseDaysAllowed, features, bookingRules } = req.body;

  // Auto-populate booking rules based on tier if not explicitly provided
  let rules = bookingRules || {};
  if (!bookingRules || Object.keys(bookingRules).length === 0) {
    switch (tier) {
      case 'Flexy':
        rules = {
          maxPassengersPerBooking: 1,
          minAdvanceBookingMinutes: 120, // 2 hours
          allowedDaysPerWeek: 7,
          allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
          isAlternateDay: false,
          isSharedRide: false,
          useManagedStops: false,
        };
        break;
      case 'Hybrid':
        rules = {
          maxPassengersPerBooking: 6,
          minAdvanceBookingMinutes: 0,
          allowedDaysPerWeek: 3,
          allowedWeekdays: [], // Customer picks at subscription time
          isAlternateDay: false,
          isSharedRide: true,
          useManagedStops: true,
        };
        break;
      case 'Weekday':
        rules = {
          maxPassengersPerBooking: 6,
          minAdvanceBookingMinutes: 0,
          allowedDaysPerWeek: 5,
          allowedWeekdays: [1, 2, 3, 4, 5], // Mon-Fri
          isAlternateDay: false,
          isSharedRide: true,
          useManagedStops: true,
        };
        break;
      case 'Standard':
      default:
        rules = {
          maxPassengersPerBooking: 6,
          minAdvanceBookingMinutes: 0,
          allowedDaysPerWeek: 7,
          allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
          isAlternateDay: false,
          isSharedRide: true,
          useManagedStops: true,
        };
        break;
    }
  }

  const plan = await Plan.create({
    name, serviceType, tier, description, durationDays, price, pauseDaysAllowed, features,
    bookingRules: rules,
  });
  return res.status(201).json(formatResponse('Plan created successfully.', plan));
});

const updatePlan = asyncWrapper(async (req, res) => {
  const plan = await Plan.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!plan) throw new NotFoundError('Plan');
  return res.status(200).json(formatResponse('Plan updated successfully.', plan));
});

const deletePlan = asyncWrapper(async (req, res) => {
  const plan = await Plan.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
  if (!plan) throw new NotFoundError('Plan');
  return res.status(200).json(formatResponse('Plan deleted successfully.'));
});

const getAnalytics = asyncWrapper(async (req, res) => {
  const { range = '7d' } = req.query;

  const now = new Date();
  let startDate;
  let daysInRange;

  if (range === '7d') {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    daysInRange = 7;
  } else if (range === '30d') {
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    daysInRange = 30;
  } else {
    startDate = new Date(now.getFullYear(), 0, 1);
    daysInRange = Math.ceil((now - startDate) / (24 * 60 * 60 * 1000));
  }

  // Summary metrics
  const [totalTrips, driverCounts, activePasses, revenueAgg, commuteAgg] = await Promise.all([
    Trip.countDocuments({ status: 'COMPLETED', tripDate: { $gte: startDate }, isDeleted: false }),
    Driver.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: null, total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } } } }
    ]),
    Subscription.countDocuments({ status: 'ACTIVE', isDeleted: false }),
    Subscription.aggregate([
      { $match: { status: 'ACTIVE', isDeleted: false } },
      { $lookup: { from: 'plans', localField: 'planId', foreignField: '_id', as: 'plan' } },
      { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$plan.price', 0] } } } }
    ]),
    Trip.aggregate([
      { $match: { status: 'COMPLETED', startedAt: { $ne: null }, completedAt: { $ne: null }, isDeleted: false } },
      { $project: { durationMs: { $subtract: ['$completedAt', '$startedAt'] } } },
      { $group: { _id: null, avgMs: { $avg: '$durationMs' } } }
    ])
  ]);

  const driverData = driverCounts[0] || { total: 0, active: 0 };
  const totalRevenue = revenueAgg[0]?.total || 0;
  const avgCommuteMs = commuteAgg[0]?.avgMs || 0;
  const avgCommuteMinutes = avgCommuteMs > 0 ? Math.round((avgCommuteMs / 60000) * 10) / 10 : null;
  const driverActivePercent = driverData.total > 0 ? Math.round((driverData.active / driverData.total) * 1000) / 10 : 0;

  // Trip trend by date bucket
  let tripTrend;
  if (range === '7d') {
    tripTrend = await Trip.aggregate([
      { $match: { status: 'COMPLETED', serviceDate: { $gte: startDate }, isDeleted: false } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$serviceDate' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    tripTrend = tripTrend.map(t => ({ label: dayNames[new Date(t._id).getDay()], value: t.count }));
  } else if (range === '30d') {
    tripTrend = await Trip.aggregate([
      { $match: { status: 'COMPLETED', serviceDate: { $gte: startDate }, isDeleted: false } },
      { $group: { _id: { $week: '$serviceDate' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    tripTrend = tripTrend.map((t, i) => ({ label: `W${i + 1}`, value: t.count }));
  } else {
    tripTrend = await Trip.aggregate([
      { $match: { status: 'COMPLETED', serviceDate: { $gte: startDate }, isDeleted: false } },
      { $group: { _id: { $month: '$serviceDate' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    tripTrend = tripTrend.map(t => ({ label: monthNames[t._id - 1], value: t.count }));
  }

  // Revenue trend
  let revenueTrend;
  if (range === '7d') {
    revenueTrend = await Subscription.aggregate([
      { $match: { createdAt: { $gte: startDate }, isDeleted: false } },
      { $lookup: { from: 'plans', localField: 'planId', foreignField: '_id', as: 'plan' } },
      { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: { $ifNull: ['$plan.price', 0] } } } },
      { $sort: { _id: 1 } }
    ]);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    revenueTrend = revenueTrend.map(t => ({ label: dayNames[new Date(t._id).getDay()], value: t.total }));
  } else if (range === '30d') {
    revenueTrend = await Subscription.aggregate([
      { $match: { createdAt: { $gte: startDate }, isDeleted: false } },
      { $lookup: { from: 'plans', localField: 'planId', foreignField: '_id', as: 'plan' } },
      { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
      { $group: { _id: { $week: '$createdAt' }, total: { $sum: { $ifNull: ['$plan.price', 0] } } } },
      { $sort: { _id: 1 } }
    ]);
    revenueTrend = revenueTrend.map((t, i) => ({ label: `W${i + 1}`, value: t.total }));
  } else {
    revenueTrend = await Subscription.aggregate([
      { $match: { createdAt: { $gte: startDate }, isDeleted: false } },
      { $lookup: { from: 'plans', localField: 'planId', foreignField: '_id', as: 'plan' } },
      { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
      { $group: { _id: { $month: '$createdAt' }, total: { $sum: { $ifNull: ['$plan.price', 0] } } } },
      { $sort: { _id: 1 } }
    ]);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    revenueTrend = revenueTrend.map(t => ({ label: monthNames[t._id - 1], value: t.total }));
  }

  // Route performance
  const routePerformance = await Trip.aggregate([
    { $match: { serviceDate: { $gte: startDate }, isDeleted: false } },
    { $lookup: { from: 'routes', localField: 'routeId', foreignField: '_id', as: 'route' } },
    { $unwind: { path: '$route', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'drivers', localField: 'driverId', foreignField: '_id', as: 'driver' } },
    { $unwind: { path: '$driver', preserveNullAndEmptyArrays: true } },
    { $group: {
      _id: '$routeId',
      routeName: { $first: '$route.name' },
      startLocation: { $first: '$route.startLocation' },
      endLocation: { $first: '$route.endLocation' },
      totalTrips: { $sum: 1 },
      completedTrips: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
      totalManifestSize: { $sum: { $size: { $ifNull: ['$passengers', []] } } },
      avgCapacity: { $avg: { $ifNull: ['$driver.vehicleCapacity', 6] } }
    }},
    { $project: {
      routeName: { $concat: [
        { $ifNull: ['$routeName', 'Unknown'] },
        ' (',
        { $ifNull: ['$startLocation', '?'] },
        ' - ',
        { $ifNull: ['$endLocation', '?'] },
        ')'
      ]},
      dailyTrips: { $round: [{ $divide: ['$totalTrips', daysInRange] }, 0] },
      avgOccupancy: { $round: [{ $multiply: [{ $divide: ['$totalManifestSize', { $multiply: [{ $max: ['$totalTrips', 1] }, { $max: ['$avgCapacity', 1] }] }] }, 100] }, 1] },
      onTimeRate: { $round: [{ $multiply: [{ $divide: ['$completedTrips', { $max: ['$totalTrips', 1] }] }, 100] }, 1] },
      revenue: { $multiply: ['$completedTrips', 500] }
    }},
    { $sort: { dailyTrips: -1 } }
  ]);

  return res.status(200).json(formatResponse('Analytics data retrieved.', {
    summary: {
      totalTrips,
      totalRevenue,
      avgCommuteMinutes,
      driverActivePercent,
      activeDrivers: driverData.active,
      totalDrivers: driverData.total,
      activePasses,
    },
    tripTrend,
    revenueTrend,
    routePerformance,
  }));
});

// --- Settings ---
const getSettings = asyncWrapper(async (req, res) => {
  const settings = await Settings.getSettings();
  return res.status(200).json(formatResponse('Settings retrieved.', settings));
});

const updateSettings = asyncWrapper(async (req, res) => {
  const allowedFields = [
    'platformName', 'maxSeatsPerCab', 'autoMatchRadius',
    'sosAutoDispatch', 'maintenanceMode', 'otpExpiryMinutes',
    'commissionRate', 'minFare',
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  const settings = await Settings.findOneAndUpdate(
    { key: 'platform_settings' },
    { $set: updates },
    { new: true, upsert: true, runValidators: true }
  );

  return res.status(200).json(formatResponse('Settings updated.', settings));
});

// --- Admin Profile ---
const getProfile = asyncWrapper(async (req, res) => {
  const admin = await Admin.findOne({ userId: req.user.id });
  if (!admin) throw new NotFoundError('Admin profile');

  const user = await User.findById(req.user.id).select('phone email');

  return res.status(200).json(formatResponse('Profile retrieved.', {
    name: admin.name,
    phone: user?.phone || '',
    email: user?.email || '',
    role: admin.role,
    permissions: admin.permissions,
  }));
});

const updateProfile = asyncWrapper(async (req, res) => {
  const admin = await Admin.findOne({ userId: req.user.id });
  if (!admin) throw new NotFoundError('Admin profile');

  const { name, email } = req.body;

  if (name !== undefined) admin.name = name;
  await admin.save();

  // Update email on User model if provided
  if (email !== undefined) {
    await User.findByIdAndUpdate(req.user.id, { email });
  }

  return res.status(200).json(formatResponse('Profile updated.', {
    name: admin.name,
    email: email || '',
    role: admin.role,
  }));
});

// --- Pause Request Approvals ---
const getPauseRequests = asyncWrapper(async (req, res) => {
  const { status } = req.query;
  const filter = { isDeleted: false };
  if (status) filter.status = status;

  const requests = await PauseRequest.find(filter)
    .populate('customerId', 'name')
    .populate('subscriptionId', 'planId routeId startDate endDate status')
    .sort({ createdAt: -1 });

  return res.status(200).json(formatResponse('Pause requests listed.', requests));
});

const approvePauseRequest = asyncWrapper(async (req, res) => {
  const pauseRequest = await PauseRequest.findById(req.params.id);
  if (!pauseRequest) throw new NotFoundError('Pause request');
  if (pauseRequest.status !== 'PENDING') throw new ValidationError('Only pending requests can be approved.');

  pauseRequest.status = 'APPROVED';
  pauseRequest.approvedBy = req.user.id;
  await pauseRequest.save();

  // Pause the subscription and decrement remaining days
  const subscription = await Subscription.findById(pauseRequest.subscriptionId);
  if (subscription && subscription.status === 'ACTIVE') {
    subscription.status = 'PAUSED';
    if (subscription.remainingPauseDays > 0) {
      subscription.remainingPauseDays -= 1;
    }
    await subscription.save();
  }

  return res.status(200).json(formatResponse('Pause request approved.', pauseRequest));
});

const rejectPauseRequest = asyncWrapper(async (req, res) => {
  const pauseRequest = await PauseRequest.findById(req.params.id);
  if (!pauseRequest) throw new NotFoundError('Pause request');
  if (pauseRequest.status !== 'PENDING') throw new ValidationError('Only pending requests can be rejected.');

  pauseRequest.status = 'REJECTED';
  pauseRequest.approvedBy = req.user.id;
  await pauseRequest.save();

  return res.status(200).json(formatResponse('Pause request rejected.', pauseRequest));
});

// --- Areas ---
const getAreas = asyncWrapper(async (req, res) => {
  const areas = await Area.find();
  return res.status(200).json(formatResponse('Areas listed successfully.', areas));
});

const createArea = asyncWrapper(async (req, res) => {
  const { name, center, radiusKm, status } = req.body;
  const area = await Area.create({
    name,
    center: { type: 'Point', coordinates: center.coordinates },
    radiusKm,
    status: status || 'ACTIVE',
  });
  return res.status(201).json(formatResponse('Area created successfully.', area));
});

const updateArea = asyncWrapper(async (req, res) => {
  const area = await Area.findById(req.params.id);
  if (!area) throw new NotFoundError('Area');

  const { name, center, radiusKm, status } = req.body;
  if (name !== undefined) area.name = name;
  if (center !== undefined) {
    area.center = { type: 'Point', coordinates: center.coordinates };
  }
  if (radiusKm !== undefined) area.radiusKm = radiusKm;
  if (status !== undefined) area.status = status;

  await area.save();
  return res.status(200).json(formatResponse('Area updated successfully.', area));
});

const deleteArea = asyncWrapper(async (req, res) => {
  const area = await Area.findById(req.params.id);
  if (!area) throw new NotFoundError('Area');
  area.isDeleted = true;
  await area.save();
  // Remove area assignment from all drivers in this area
  await Driver.updateMany({ areaId: area._id }, { $unset: { areaId: 1 } });
  return res.status(200).json(formatResponse('Area deleted successfully.'));
});

module.exports = {
  getAnalytics,
  getDashboard,
  getDrivers,
  getDriverById,
  createDriver,
  updateDriver,
  deleteDriver,
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  banCustomer,
  getTrips,
  getTripById,
  createTrip,
  updateTrip,
  deleteTrip,
  reassignTrip,
  getRoutes,
  createRoute,
  updateRoute,
  deleteRoute,
  getOperationalExceptions,
  resolveOperationalException,
  getPlans,
  createPlan,
  updatePlan,
  deletePlan,
  getSubscriptions,
  createSubscription,
  updateSubscription,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  getSettings,
  updateSettings,
  getProfile,
  updateProfile,
  getPauseRequests,
  approvePauseRequest,
  rejectPauseRequest,
  getAreas,
  createArea,
  updateArea,
  deleteArea,
};
