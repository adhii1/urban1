const Driver = require('../models/Driver');
const RideRequest = require('../models/RideRequest');
const Route = require('../models/Route');
const ShuttleSession = require('../models/ShuttleSession');
const shuttleService = require('../services/shuttleService');
const { ACTIVE_SHUTTLE_STATUSES } = shuttleService;
const { emitToUser, getUserSocketCount } = require('../config/socket');
const logger = require('../utils/logger');
const { generateOtp } = require('../utils/otpHelper');
const ridePairing = require('../services/ridePairingService');
const { validateSocketEvent, schemas } = require('../validations/socketValidation');
const { adminActionLimiter } = require('../utils/socketRateLimiter');
const { reject, rateLimited } = require('./socketHelpers');

const validateAdminReassign = validateSocketEvent(schemas.adminReassign);
const validateAdminUpdateRideLocation = validateSocketEvent(schemas.adminUpdateRideLocation);
const validateAdminUpdateDriverLocation = validateSocketEvent(schemas.adminUpdateDriverLocation);

function registerAdminEvents(io) {
  const adminNamespace = io.of('/sockets/admin');

  adminNamespace.on('connection', (socket) => {
    logger.info(`Admin ${socket.userId} connected`);

    socket.on('admin:drivers:online', async () => {
      try {
        const drivers = await Driver.find({ isOnline: true, isDeleted: false })
          .populate('userId', 'phone')
          .select('name vehicleNumber currentLocation isAvailable status')
          .lean();

        socket.emit('admin:drivers:online:response', { count: drivers.length, drivers });
      } catch (err) {
        logger.error('admin:drivers:online error', { error: err.message });
      }
    });

    socket.on('admin:customers:online', () => {
      const count = getUserSocketCount('customer');
      socket.emit('admin:customers:online:response', { count });
    });

    socket.on('admin:rides:active', async () => {
      try {
        const rides = await RideRequest.find({
          status: { $in: ['PENDING', 'ACCEPTED', 'DRIVER_ARRIVING', 'IN_PROGRESS'] },
          isDeleted: false,
        })
          .populate('customerId', 'phone')
          .populate('acceptedDriverId', 'name vehicleNumber')
          .lean();

        socket.emit('admin:rides:active:response', { rides });
      } catch (err) {
        logger.error('admin:rides:active error', { error: err.message });
      }
    });

    socket.on('admin:ride:reassign', async (data) => {
      try {
        if (rateLimited(socket, 'admin:ride:reassign', adminActionLimiter, 'admin:ride:reassign:error', 'Too many requests')) return;
        const v = validateAdminReassign(data);
        if (!v.valid) return reject(socket, 'admin:ride:reassign:error', v.error, 'Invalid reassign payload');
        const { rideRequestId, driverId } = v.value;
        const rideRequest = await RideRequest.findById(rideRequestId);
        const driver = await Driver.findById(driverId);

        if (!rideRequest || !driver) {
          socket.emit('admin:ride:reassign:error', {
            message: 'Ride or driver not found',
          });
          return;
        }

        // Enforce state machine: only PENDING or ACCEPTED rides can be
        // reassigned. Reassigning IN_PROGRESS or COMPLETED rides would
        // corrupt the trip state — the customer is mid-ride.
        if (!['PENDING', 'ACCEPTED'].includes(rideRequest.status)) {
          socket.emit('admin:ride:reassign:error', {
            message: `Cannot reassign ride with status "${rideRequest.status}"`,
          });
          return;
        }

        if (driver.status !== 'ACTIVE' || driver.isDeleted) {
          socket.emit('admin:ride:reassign:error', { message: 'Driver is not active' });
          return;
        }

        if (!driver.isOnline) {
          socket.emit('admin:ride:reassign:error', { message: 'Driver is offline' });
          return;
        }

        // Validate route assignment: if the ride has a route and the driver
        // has a route, they must match (or driver has no route = flexible).
        if (rideRequest.routeId && driver.routeId) {
          if (rideRequest.routeId.toString() !== driver.routeId.toString()) {
            socket.emit('admin:ride:reassign:error', {
              message: 'Driver is not assigned to this ride\'s route',
            });
            return;
          }
        }

        // Atomically lock the target driver to prevent double-booking
        // (TOCTOU: the driver could have accepted another ride between
        // the check and the update below).
        const locked = await Driver.findOneAndUpdate(
          { _id: driver._id, isAvailable: true },
          { $set: { isAvailable: false } }
        );
        if (!locked) {
          socket.emit('admin:ride:reassign:error', { message: 'Driver has an active ride' });
          return;
        }

        if (rideRequest.acceptedDriverId) {
          const oldDriverId = rideRequest.acceptedDriverId.toString();
          if (oldDriverId === driver._id.toString()) {
            // No-op: same driver — release the lock and return.
            await Driver.findByIdAndUpdate(driver._id, { isAvailable: true });
            socket.emit('admin:ride:reassign:ack', { success: true });
            return;
          }
          await Driver.findByIdAndUpdate(rideRequest.acceptedDriverId, {
            isAvailable: true,
          });
          ridePairing.clearPairing(oldDriverId, rideRequest.customerId.toString());
        }

        const otpCode = generateOtp();

        rideRequest.acceptedDriverId = driver._id;
        rideRequest.status = 'ACCEPTED';
        rideRequest.otp = {
          code: otpCode,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          verified: false,
        };
        // Ensure new driver is in matchedDrivers list
        const alreadyMatched = rideRequest.matchedDrivers.some(
          (d) => d.driverId && d.driverId.toString() === driver._id.toString()
        );
        if (!alreadyMatched) {
          rideRequest.matchedDrivers.push({ driverId: driver._id, response: 'ACCEPTED', respondedAt: new Date() });
        } else {
          const entry = rideRequest.matchedDrivers.find(
            (d) => d.driverId && d.driverId.toString() === driver._id.toString()
          );
          if (entry) {
            entry.response = 'ACCEPTED';
            entry.respondedAt = new Date();
          }
        }
        await rideRequest.save();

        ridePairing.setPairing(driver._id.toString(), rideRequest.customerId.toString());

        emitToUser('driver', driver.userId.toString(), 'ride:assigned', {
          rideRequestId: rideRequest._id,
          pickup: rideRequest.pickupLocation,
          drop: rideRequest.dropLocation,
          assignedBy: 'admin',
        });

        const { estimateEtaMinutes } = require('../utils/geoHelper');
        const driverForEta = await Driver.findById(driver._id).select('currentLocation').lean();
        const etaMinutes = estimateEtaMinutes(
          driverForEta?.currentLocation?.coordinates || [0, 0],
          rideRequest.pickupLocation.coordinates
        );

        emitToUser('customer', rideRequest.customerId.toString(), 'ride:accepted', {
          rideRequestId: rideRequest._id,
          driver: {
            id: driver._id,
            name: driver.name,
            phone: driver.userId?.phone,
            vehicleNumber: driver.vehicleNumber,
            vehicleModel: driver.vehicleModel,
            currentLocation: driverForEta?.currentLocation,
          },
          otp: otpCode,
          etaMinutes,
          pickup: rideRequest.pickupLocation,
          drop: rideRequest.dropLocation,
          reassigned: true,
        });

        socket.emit('admin:ride:reassign:ack', { success: true });
      } catch (err) {
        logger.error('admin:ride:reassign error', { error: err.message });
        socket.emit('admin:ride:reassign:error', {
          message: 'Failed to reassign ride',
        });
      }
    });

    socket.on('admin:ride:update-location', async (data) => {
      try {
        if (rateLimited(socket, 'admin:ride:update-location', adminActionLimiter, 'admin:ride:update-location:error', 'Too many requests')) return;
        const v = validateAdminUpdateRideLocation(data);
        if (!v.valid) return reject(socket, 'admin:ride:update-location:error', v.error, 'Invalid payload');
        const { rideRequestId, type, address, coordinates } = v.value;
        const update = {};

        if (type === 'pickup') {
          update['pickupLocation.address'] = address;
          update['pickupLocation.coordinates'] = coordinates;
        } else if (type === 'drop') {
          update['dropLocation.address'] = address;
          update['dropLocation.coordinates'] = coordinates;
        }

        const rideRequest = await RideRequest.findByIdAndUpdate(
          rideRequestId,
          { $set: update },
          { new: true }
        );

        if (!rideRequest) {
          socket.emit('admin:ride:update-location:error', {
            message: 'Ride not found',
          });
          return;
        }

        if (rideRequest.acceptedDriverId) {
          const driver = await Driver.findById(rideRequest.acceptedDriverId);
          if (driver) {
            emitToUser('driver', driver.userId.toString(), 'ride:location-updated', {
              rideRequestId: rideRequest._id,
              type,
              address,
              coordinates,
            });
          }
        }

        emitToUser('customer', rideRequest.customerId.toString(), 'ride:location-updated', {
          rideRequestId: rideRequest._id,
          type,
          address,
          coordinates,
        });

        socket.emit('admin:ride:update-location:ack', { success: true });
      } catch (err) {
        logger.error('admin:ride:update-location error', { error: err.message });
      }
    });

    socket.on('admin:driver:update-location', async (data) => {
      try {
        if (rateLimited(socket, 'admin:driver:update-location', adminActionLimiter, 'admin:driver:update-location:error', 'Too many requests')) return;
        const v = validateAdminUpdateDriverLocation(data);
        if (!v.valid) return reject(socket, 'admin:driver:update-location:error', v.error, 'Invalid payload');
        const { driverId, latitude, longitude } = v.value;
        await Driver.findByIdAndUpdate(driverId, {
          currentLocation: {
            type: 'Point',
            coordinates: [longitude, latitude],
          },
        });

        const customers = ridePairing.getCustomersForDriver(driverId);
        const payload = {
          driverId,
          coordinates: [longitude, latitude],
          timestamp: new Date(),
        };
        for (const customerId of customers) {
          emitToUser('customer', customerId, 'driver:location:update', payload);
        }

        socket.emit('admin:driver:update-location:ack', { success: true });
      } catch (err) {
        logger.error('admin:driver:update-location error', { error: err.message });
      }
    });

    socket.on('admin:shuttles:active', async () => {
      try {
        const shuttles = await ShuttleSession.find({ status: { $in: ACTIVE_SHUTTLE_STATUSES }, isDeleted: false })
          .populate('driverId', 'name vehicleNumber vehicleModel vehicleCapacity currentLocation')
          .lean();

        const shuttlesWithRides = await Promise.all(
          shuttles.map(async (shuttle) => {
            const rides = await RideRequest.find({
              _id: { $in: shuttle.rideRequestIds },
            })
              .select('customerId customerName customerPhone pickupLocation dropLocation status fare')
              .populate('customerId', 'phone')
              .lean();
            return { ...shuttle, rides };
          })
        );

        socket.emit('admin:shuttles:active:response', { shuttles: shuttlesWithRides });
      } catch (err) {
        logger.error('admin:shuttles:active error', { error: err.message });
      }
    });

    socket.on('admin:shuttle:detail', async (data) => {
      try {
        if (!data || !data.shuttleSessionId) return;
        const result = await shuttleService.getShuttleWithRideDetails(data.shuttleSessionId);
        if (!result) {
          socket.emit('admin:shuttle:detail:error', { message: 'Shuttle not found' });
          return;
        }
        const driver = await Driver.findById(result.shuttle.driverId)
          .populate('userId', 'phone')
          .lean();
        socket.emit('admin:shuttle:detail:response', {
          shuttle: result.shuttle,
          rides: result.rides,
          driver,
        });
      } catch (err) {
        logger.error('admin:shuttle:detail error', { error: err.message });
      }
    });

    socket.on('admin:shuttle:cancel', async (data) => {
      try {
        if (rateLimited(socket, 'admin:shuttle:cancel', adminActionLimiter, 'admin:shuttle:cancel:error', 'Too many requests')) return;
        if (!data || !data.shuttleSessionId) return;

        const shuttle = await ShuttleSession.findOne({
          _id: data.shuttleSessionId,
          status: { $in: ACTIVE_SHUTTLE_STATUSES },
        });

        if (!shuttle) {
          socket.emit('admin:shuttle:cancel:error', { message: 'Shuttle not found or not active' });
          return;
        }

        await shuttleService.cancelShuttleSession(data.shuttleSessionId);

        const driver = await Driver.findById(shuttle.driverId).select('userId').lean();
        if (driver?.userId) {
          emitToUser('driver', driver.userId.toString(), 'shuttle:cancel:ack', {
            cancelledBy: 'admin',
            message: 'Admin cancelled your shuttle session',
          });
          await Driver.findByIdAndUpdate(shuttle.driverId, { isAvailable: true });
        }

        for (const rideId of shuttle.rideRequestIds) {
          const ride = await RideRequest.findById(rideId).select('customerId').lean();
          if (ride?.customerId) {
            emitToUser('customer', ride.customerId.toString(), 'ride:cancelled', {
              rideRequestId: rideId,
              message: 'Shuttle cancelled by admin. Finding another driver...',
            });
          }
        }

        socket.emit('admin:shuttle:cancel:ack', { success: true, shuttleSessionId: data.shuttleSessionId });
      } catch (err) {
        logger.error('admin:shuttle:cancel error', { error: err.message });
        socket.emit('admin:shuttle:cancel:error', { message: 'Failed to cancel shuttle' });
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Admin ${socket.userId} disconnected`);
    });
  });
}

module.exports = { registerAdminEvents };
