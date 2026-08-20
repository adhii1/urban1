/**
 * TripAssignmentService — Per PDF section 10
 *
 * Driver assignment flow:
 * 1. Backend sends assignment to driver
 * 2. Driver sees: passenger list, pickup time, route — Accept / Reject
 * 3. If accepted: ASSIGNMENT_STATUS = ACCEPTED, lock assignment
 * 4. If rejected: release → find next suitable driver → send assignment
 *    Don't make Admin manually redo everything.
 */

const Trip = require('../models/Trip');
const Driver = require('../models/Driver');
const Subscription = require('../models/Subscription');
const { findEligibleDrivers, findAreaForPickup } = require('./SubscriptionMatchingService');
const { optimizePickupOrder, buildNavigationUrl, generateRideOtp } = require('./DailyTripGenerator');
const { emitToUser } = require('../config/socket');
const logger = require('../utils/logger');

/**
 * Offer a trip to its assigned driver via Socket.IO.
 * Per PDF section 10: driver sees passengers, pickup time, route.
 */
async function offerTripToDriver(tripId) {
  const trip = await Trip.findById(tripId)
    .populate('driverId')
    .populate('passengers.customerId', 'name');

  if (!trip || !trip.driverId) {
    return { success: false, reason: 'Trip or driver not found' };
  }

  // Update assignment status
  trip.assignmentStatus = 'OFFERED';
  trip.offeredAt = new Date();
  await trip.save();

  // Send to driver via socket
  const driverUserId = trip.driverId.userId?.toString();
  if (driverUserId) {
    emitToUser('driver', driverUserId, 'trip:assignment', {
      tripId: trip._id,
      serviceDate: trip.serviceDate,
      pickupTime: trip.pickupTime,
      passengerCount: trip.passengers.length,
      passengers: trip.passengers.map((p) => ({
        name: p.customerId?.name || 'Customer',
        pickup: p.pickupLocation,
        drop: p.dropLocation,
        pickupOrder: p.pickupOrder,
      })),
      navigationUrl: trip.navigationUrl,
      assignmentStatus: 'OFFERED',
    });
  }

  return { success: true, tripId: trip._id };
}

/**
 * Driver accepts the trip assignment.
 * Per PDF: Backend changes ASSIGNMENT_STATUS = ACCEPTED and locks the assignment.
 */
async function acceptTrip(tripId, driverUserId) {
  const trip = await Trip.findOne({
    _id: tripId,
    assignmentStatus: { $in: ['PENDING', 'OFFERED'] },
  }).populate('driverId');

  if (!trip) {
    return { success: false, reason: 'Trip not found or already processed' };
  }

  // Verify this driver owns the trip
  if (trip.driverId?.userId?.toString() !== driverUserId) {
    return { success: false, reason: 'Not authorized for this trip' };
  }

  trip.assignmentStatus = 'ACCEPTED';
  trip.status = 'ACCEPTED';
  trip.acceptedAt = new Date();
  await trip.save();

  // Notify all passengers that driver is assigned
  for (const passenger of trip.passengers) {
    const customerId = passenger.customerId?.toString();
    if (customerId) {
      emitToUser('customer', customerId, 'ride:driver-assigned', {
        tripId: trip._id,
        driver: {
          name: trip.driverId.name,
          vehicleNumber: trip.driverId.vehicleNumber,
          vehicleModel: trip.driverId.vehicleModel,
        },
        otp: passenger.otp?.code,
        pickupTime: trip.pickupTime,
        serviceDate: trip.serviceDate,
      });
    }
  }

  logger.info('[TripAssignment] Trip accepted', { tripId: trip._id, driverId: trip.driverId._id });
  return { success: true, trip };
}

/**
 * Driver rejects the trip assignment.
 * Per PDF section 10: Backend should immediately release → find next → send assignment.
 * Don't make Admin manually redo everything.
 */
async function rejectTrip(tripId, driverUserId) {
  const trip = await Trip.findOne({
    _id: tripId,
    assignmentStatus: { $in: ['PENDING', 'OFFERED'] },
  }).populate('driverId');

  if (!trip) {
    return { success: false, reason: 'Trip not found or already processed' };
  }

  if (trip.driverId?.userId?.toString() !== driverUserId) {
    return { success: false, reason: 'Not authorized for this trip' };
  }

  const rejectedDriverId = trip.driverId._id;
  trip.assignmentStatus = 'REJECTED';
  trip.rejectedAt = new Date();
  await trip.save();

  logger.info('[TripAssignment] Trip rejected, finding next driver', { tripId: trip._id, rejectedDriver: rejectedDriverId });

  // Find next suitable driver (exclude the one who rejected)
  const nextDriver = await findNextDriver(trip, rejectedDriverId);

  if (nextDriver) {
    // Reassign to next driver
    trip.driverId = nextDriver._id;
    trip.assignmentStatus = 'PENDING';
    trip.rejectedAt = null;

    // Re-optimize route from new driver's location
    const driverCoords = nextDriver.currentLocation?.coordinates || [0, 0];
    const reorderedPassengers = optimizePickupOrder(driverCoords, trip.passengers);
    trip.passengers = reorderedPassengers;

    const firstDrop = reorderedPassengers[0]?.dropLocation?.coordinates;
    trip.navigationUrl = buildNavigationUrl(driverCoords, reorderedPassengers, firstDrop);

    await trip.save();

    // Offer to the new driver
    await offerTripToDriver(trip._id);

    return { success: true, reassigned: true, newDriverId: nextDriver._id };
  }

  // No driver available — mark trip as needing admin intervention
  logger.warn('[TripAssignment] No alternative driver found', { tripId: trip._id });
  return { success: true, reassigned: false, reason: 'No alternative drivers available. Admin intervention needed.' };
}

/**
 * Find the next eligible driver for a trip after rejection.
 * Excludes the rejected driver. Uses the same matching criteria.
 */
async function findNextDriver(trip, excludeDriverId) {
  if (!trip.passengers.length) return null;

  // Use first passenger's pickup to find area
  const pickupCoords = trip.passengers[0].pickupLocation?.coordinates;
  if (!pickupCoords) return null;

  const area = await findAreaForPickup(pickupCoords);
  if (!area) return null;

  const candidates = await findEligibleDrivers({
    pickupCoordinates: pickupCoords,
    area,
    scheduleDays: [trip.serviceDate.getDay()],
    serviceDate: trip.serviceDate,
    requiredCapacity: trip.passengers.length,
  });

  // Filter out the rejected driver
  const eligible = candidates.filter((c) => c.driver._id.toString() !== excludeDriverId.toString());
  return eligible.length > 0 ? eligible[0].driver : null;
}

module.exports = {
  offerTripToDriver,
  acceptTrip,
  rejectTrip,
  findNextDriver,
};
