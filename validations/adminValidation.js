const Joi = require('joi');

const phoneRegex = /^[6-9]\d{9}$/;

const location = Joi.object({
  type: Joi.string().valid('Point').default('Point'),
  coordinates: Joi.array().items(Joi.number()).length(2).required(),
  address: Joi.string().optional(),
});

const bankDetails = Joi.object({
  accountHolderName: Joi.string().trim().max(120).optional().allow(null, ''),
  accountNumber: Joi.string().trim().max(30).optional().allow(null, ''),
  ifsc: Joi.string().trim().max(15).optional().allow(null, ''),
}).optional();

const createDriver = Joi.object({
  phone: Joi.string().pattern(phoneRegex).required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().trim().min(1).max(100).required(),
  vehicleNumber: Joi.string().trim().max(20).required(),
  vehicleModel: Joi.string().trim().max(100).required(),
  vehicleCapacity: Joi.number().integer().min(1).max(20).required(),
  licenseNumber: Joi.string().trim().max(50).required(),
  routeId: Joi.string().hex().length(24).optional().allow(null, ''),
  areaId: Joi.string().hex().length(24).optional().allow(null, ''),
  zoneId: Joi.string().hex().length(24).optional().allow(null, ''),
  upiId: Joi.string().trim().max(120).optional().allow(null, ''),
  bankDetails,
});

const updateDriver = Joi.object({
  name: Joi.string().trim().min(1).max(100).optional(),
  password: Joi.string().min(6).optional().allow(null, ''),
  vehicleNumber: Joi.string().trim().max(20).optional(),
  vehicleModel: Joi.string().trim().max(100).optional(),
  vehicleCapacity: Joi.number().integer().min(1).max(20).optional(),
  licenseNumber: Joi.string().trim().max(50).optional(),
  routeId: Joi.string().hex().length(24).optional().allow(null, ''),
  areaId: Joi.string().hex().length(24).optional().allow(null, ''),
  zoneId: Joi.string().hex().length(24).optional().allow(null, ''),
  upiId: Joi.string().trim().max(120).optional().allow(null, ''),
  bankDetails,
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_APPROVAL').optional(),
});

const createCustomer = Joi.object({
  phone: Joi.string().pattern(phoneRegex).required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().trim().min(1).max(100).required(),
  homeLocation: location.optional(),
  pickupLocation: location.optional(),
  dropLocation: location.optional(),
});

const updateCustomer = Joi.object({
  name: Joi.string().trim().min(1).max(100).optional(),
  homeLocation: location.optional(),
  pickupLocation: location.optional(),
  dropLocation: location.optional(),
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'SUSPENDED', 'BANNED').optional(),
});

const createRoute = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  startLocation: Joi.string().trim().max(200).required(),
  endLocation: Joi.string().trim().max(200).required(),
  stops: Joi.array().items(Joi.object({
    stopName: Joi.string().trim().max(200).required(),
    sequenceOrder: Joi.number().integer().min(0).required(),
    location: Joi.object({
      type: Joi.string().valid('Point').default('Point'),
      coordinates: Joi.array().items(Joi.number()).length(2).required(),
    }).required(),
  })).min(1).required(),
  status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
});

const updateRoute = Joi.object({
  name: Joi.string().trim().min(1).max(200).optional(),
  startLocation: Joi.string().trim().max(200).optional(),
  endLocation: Joi.string().trim().max(200).optional(),
  // Existing stops must retain their durable identifier when edited or
  // reordered; omitted IDs explicitly represent removed/new stops.
  stops: Joi.array().items(Joi.object({
    stopId: Joi.string().trim().max(100).optional(),
    stopName: Joi.string().trim().max(200).required(),
    sequenceOrder: Joi.number().integer().min(0).required(),
    location: Joi.object({
      type: Joi.string().valid('Point').default('Point'),
      coordinates: Joi.array().items(Joi.number()).length(2).required(),
    }).required(),
  })).min(1).optional(),
  assignedDriver: Joi.string().hex().length(24).optional().allow(null, ''),
  status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
});

const resolveOperationalException = Joi.object({
  pickupStopId: Joi.string().trim().max(100).required(),
  dropStopId: Joi.string().trim().max(100).required(),
  effectiveDate: Joi.date().iso().optional(),
  notes: Joi.string().trim().max(1000).optional().allow(''),
});

const createTrip = Joi.object({
  routeId: Joi.string().hex().length(24).required(),
  driverId: Joi.string().hex().length(24).required(),
  tripDate: Joi.date().iso().required(),
  customerIds: Joi.array().items(Joi.string().hex().length(24)).min(1).required(),
});

const updateTrip = Joi.object({
  routeId: Joi.string().hex().length(24).optional(),
  driverId: Joi.string().hex().length(24).optional(),
  tripDate: Joi.date().iso().optional(),
  status: Joi.string().valid('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED').optional(),
});

const createPlan = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  serviceType: Joi.string().valid('Home-to-Office', 'Stop-to-Stop').required(),
  tier: Joi.string().valid('Flexy', 'Hybrid', 'Weekday', 'Standard').required(),
  description: Joi.string().max(500).optional().allow(''),
  durationDays: Joi.number().integer().min(1).max(365).required(),
  price: Joi.number().min(0).required(),
  pauseDaysAllowed: Joi.number().integer().min(0).default(0),
  features: Joi.array().items(Joi.string()).optional(),
  isActive: Joi.boolean().optional(),
});

const updatePlan = Joi.object({
  name: Joi.string().trim().min(1).max(100).optional(),
  serviceType: Joi.string().valid('Home-to-Office', 'Stop-to-Stop').optional(),
  tier: Joi.string().valid('Flexy', 'Hybrid', 'Weekday', 'Standard').optional(),
  description: Joi.string().max(500).optional().allow(''),
  durationDays: Joi.number().integer().min(1).max(365).optional(),
  price: Joi.number().min(0).optional(),
  pauseDaysAllowed: Joi.number().integer().min(0).optional(),
  features: Joi.array().items(Joi.string()).optional(),
  isActive: Joi.boolean().optional(),
});

const createSubscription = Joi.object({
  customerId: Joi.string().hex().length(24).required(),
  planId: Joi.string().hex().length(24).required(),
  routeId: Joi.string().hex().length(24).required(),
  startDate: Joi.date().iso().required(),
});

const updateSubscription = Joi.object({
  planId: Joi.string().hex().length(24).optional(),
  routeId: Joi.string().hex().length(24).optional(),
  endDate: Joi.date().iso().optional(),
  status: Joi.string().valid('ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED').optional(),
}).min(1);

const reassignTrip = Joi.object({
  driverId: Joi.string().hex().length(24).required(),
  customerIds: Joi.array().items(Joi.string().hex().length(24)).optional(),
});

const pauseSubscription = Joi.object({});

const resumeSubscription = Joi.object({});

const createArea = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  center: Joi.object({
    coordinates: Joi.array().items(Joi.number()).length(2).required(),
  }).required(),
  radiusKm: Joi.number().min(0.5).max(50).required(),
  status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
  zoneId: Joi.string().hex().length(24).optional().allow(null, ''),
});

const updateArea = Joi.object({
  name: Joi.string().trim().min(1).max(100).optional(),
  center: Joi.object({
    coordinates: Joi.array().items(Joi.number()).length(2).required(),
  }).optional(),
  radiusKm: Joi.number().min(0.5).max(50).optional(),
  status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
  zoneId: Joi.string().hex().length(24).optional().allow(null, ''),
});

const createZone = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  code: Joi.string().trim().max(10).optional().allow(null, ''),
  description: Joi.string().trim().max(300).optional().allow(''),
  status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
});

const updateZone = Joi.object({
  name: Joi.string().trim().min(1).max(100).optional(),
  description: Joi.string().trim().max(300).optional().allow(''),
  status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
});

module.exports = {
  createDriver,
  updateDriver,
  createCustomer,
  updateCustomer,
  createRoute,
  updateRoute,
  createTrip,
  updateTrip,
  createPlan,
  updatePlan,
  createSubscription,
  updateSubscription,
  reassignTrip,
  pauseSubscription,
  resumeSubscription,
  resolveOperationalException,
  createArea,
  updateArea,
  createZone,
  updateZone,
};
