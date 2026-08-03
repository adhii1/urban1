const RideRequest = require('../models/RideRequest');
const Driver = require('../models/Driver');
const Customer = require('../models/Customer');
const User = require('../models/User');
const { findNearbyDrivers, isWithinRadius, MATCH_RADIUS_KM } = require('../services/matchingService');
const { emitToUser } = require('../config/socket');
const logger = require('../utils/logger');
const ridePairing = require('../services/ridePairingService');
const { validateSocketEvent, schemas } = require('../validations/socketValidation');
const { rideRequestLimiter, rideActionLimiter } = require('../utils/socketRateLimiter');
const { reject, rateLimited } = require('./socketHelpers');
const { estimateFare, calculateCancellationFee } = require('../services/fareService');
const { estimateTripDuration } = require('../utils/geoHelper');
const shuttleService = require('../services/shuttleService');

const validateRideRequest = validateSocketEvent(schemas.rideRequest);
const validateRideCancel = validateSocketEvent(schemas.rideCancel);

function registerCustomerEvents(io) {
  const customerNamespace = io.of('/sockets/customer');

  customerNamespace.on('connection', (socket) => {
    socket.on('ride:request', async (data) => {
      const userId = socket.userId;
      try {
        if (!userId) return reject(socket, 'ride:request:error', null, 'Not authenticated');
        if (rateLimited(socket, 'ride:request', rideRequestLimiter, 'ride:request:error', 'Please wait before requesting another ride')) return;
        const v = validateRideRequest(data);
        if (!v.valid) return reject(socket, 'ride:request:error', v.error, 'Invalid ride payload');
        const { pickup, drop, stops } = v.value;

        // Resolve customer name if the connection handler hasn't set it yet
        // (async race on initial connect).
        if (!socket.customerName && userId) {
          const customer = await Customer.findOne({ userId }).select('name').lean();
          socket.customerName = customer?.name || 'Unknown';
          socket.customerPhone = socket.customerPhone || (await User.findById(userId).select('phone').lean())?.phone;
        }

        if (!isWithinRadius(pickup.coordinates, drop.coordinates, MATCH_RADIUS_KM * 10)) {
          socket.emit('ride:request:error', {
            message: 'Pickup and drop are too far apart (max 50km)',
          });
          return;
        }

        // Validate multi-stop distances (each stop should be within 10km of previous)
        if (stops && stops.length > 0) {
          const { haversineKm } = require('../utils/geoHelper');
          let prevCoords = pickup.coordinates;
          for (let i = 0; i < stops.length; i++) {
            const stop = stops[i];
            const distance = haversineKm(prevCoords, stop.coordinates);
            if (distance > 10) {
              socket.emit('ride:request:error', {
                message: `Stop ${i + 1} is too far from the previous location (max 10km between stops)`,
              });
              return;
            }
            prevCoords = stop.coordinates;
          }
          // Check last stop to drop distance
          const lastStopToDrop = haversineKm(prevCoords, drop.coordinates);
          if (lastStopToDrop > 10) {
            socket.emit('ride:request:error', {
              message: 'Final destination is too far from the last stop (max 10km)',
            });
            return;
          }
        }

        // Calculate fare estimate and trip duration
        const fareEstimate = await estimateFare(
          pickup.coordinates,
          drop.coordinates,
          stops || [],
          new Date(),
          RideRequest
        );
        const tripDuration = estimateTripDuration(pickup.coordinates, drop.coordinates);

        const rideRequest = await RideRequest.create({
          customerId: userId,
          customerName: socket.customerName,
          customerPhone: socket.customerPhone,
          pickupLocation: {
            address: pickup.address,
            type: 'Point',
            coordinates: pickup.coordinates,
          },
          dropLocation: {
            address: drop.address,
            type: 'Point',
            coordinates: drop.coordinates,
          },
          stops: (stops || []).map((s, i) => ({
            address: s.address,
            type: 'Point',
            coordinates: s.coordinates,
            sequenceOrder: i + 1,
          })),
          status: 'PENDING',
          fare: {
            estimated: fareEstimate.estimated,
            breakdown: fareEstimate.breakdown,
            details: fareEstimate.details,
          },
        });

        logger.info('[BUNDLE_DEBUG] New ride request created', {
          RideRequestId: rideRequest._id,
          CustomerId: userId,
          PickupCoordinates: pickup.coordinates,
          DropCoordinates: drop.coordinates,
          RequestedAt: rideRequest.requestedAt || new Date()
        });

        // Delegate matching to the BundleMatchingEngine
        const bundleEngine = require('../services/BundleMatchingEngine');
        logger.info('[BUNDLE_DEBUG] Triggering BundleMatchingEngine', {
          RideRequestId: rideRequest._id
        });
        bundleEngine.processNewRideRequest(rideRequest._id).catch(err => {
          logger.error('Failed to trigger bundle evaluation', { error: err.message });
        });

        socket.emit('ride:request:ack', {
          success: true,
          rideRequestId: rideRequest._id,
          message: `Searching for drivers... Your request is being evaluated for carpooling.`,
          fareEstimate: fareEstimate.estimated,
          fareBreakdown: fareEstimate.breakdown,
          tripDuration: tripDuration.durationMinutes,
          tripDistance: tripDuration.distanceKm,
          surgeInfo: fareEstimate.details.surgeLabel ? {
            multiplier: fareEstimate.details.surgeMultiplier,
            label: fareEstimate.details.surgeLabel,
          } : null,
        });

        io.of('/sockets/admin').emit('ride:new', {
          rideRequestId: rideRequest._id,
          customerId: userId,
          pickup: pickup.address,
          drop: drop.address,
        });
      } catch (err) {
        logger.error('ride:request error', { error: err.message });
        socket.emit('ride:request:error', {
          message: 'Failed to create ride request',
        });
      }
    });

    socket.on('ride:cancel', async (data) => {
      const userId = socket.userId;
      try {
        if (rateLimited(socket, 'ride:cancel', rideActionLimiter, 'ride:cancel:error', 'Too many requests')) return;
        const v = validateRideCancel(data);
        if (!v.valid) return reject(socket, 'ride:cancel:error', v.error, 'Invalid cancel payload');
        const { rideRequestId, reason } = v.value;
        const rideRequest = await RideRequest.findById(rideRequestId);

        if (!rideRequest) {
          socket.emit('ride:cancel:error', { message: 'Ride not found' });
          return;
        }

        if (rideRequest.customerId.toString() !== userId) {
          socket.emit('ride:cancel:error', { message: 'Not authorized for this ride' });
          return;
        }

        if (!['PENDING', 'ACCEPTED', 'DRIVER_ARRIVING'].includes(rideRequest.status)) {
          socket.emit('ride:cancel:error', {
            message: 'Cannot cancel ride in current status',
          });
          return;
        }

        // Capture matchedDrivers BEFORE save() — the pre('save') hook clears
        // matchedDrivers when status becomes CANCELLED.
        const preCancelMatchedDrivers = rideRequest.matchedDrivers ? [...rideRequest.matchedDrivers] : [];
        const preCancelAcceptedDriverId = rideRequest.acceptedDriverId;

        // Calculate cancellation fee (if driver was accepted and it's been > 2 minutes)
        let cancellationFee = 0;
        if (preCancelAcceptedDriverId) {
          cancellationFee = calculateCancellationFee(
            rideRequest.requestedAt || rideRequest.createdAt,
            new Date(),
            rideRequest.fare
          );
        }

        rideRequest.status = 'CANCELLED';
        rideRequest.cancelledAt = new Date();
        rideRequest.cancelReason = reason || 'Customer cancelled';
        rideRequest.ttlAt = new Date();
        
        // Store cancellation fee if applicable
        if (cancellationFee > 0) {
          rideRequest.cancellationFee = cancellationFee;
        }

        let shouldNotifyAcceptedDriver = true;
        if (rideRequest.shuttleSessionId) {
          try {
            const shuttle = await shuttleService.removeRideFromShuttleSession(
              rideRequest.shuttleSessionId,
              rideRequest._id
            );
            if (shuttle) {
              if (shuttle.rideRequestIds.length === 0) {
                await Driver.findByIdAndUpdate(preCancelAcceptedDriverId, {
                  isAvailable: true,
                });
                ridePairing.clearPairing(preCancelAcceptedDriverId.toString(), rideRequest.customerId.toString());
                
                shuttle.status = 'CANCELLED';
                await shuttle.save();
              } else {
                // There are still other passengers in the bundle!
                // Do NOT notify the accepted driver to cancel their active state.
                shouldNotifyAcceptedDriver = false;
              }
            }
          } catch (err) {
            logger.warn('Failed to remove ride from shuttle session during cancel', {
              error: err.message,
              rideRequestId: rideRequest._id,
            });
          }
        } else if (rideRequest.isBundled && rideRequest.status === 'PENDING') {
          // If cancelled before driver accepted, we just disbanded it from the bundle essentially.
          // Other rides in bundleId remain PENDING but with isBundled true.
          // In a full implementation, we might re-evaluate the bundle here.
          rideRequest.isBundled = false;
        }

        await rideRequest.save();

        // Notify all matched drivers (both PENDING and ACCEPTED) that the ride is gone
        const driverIds = [];
        if (preCancelMatchedDrivers.length) {
          for (const md of preCancelMatchedDrivers) {
            if (md.driverId) driverIds.push(md.driverId);
          }
        }
        if (preCancelAcceptedDriverId && shouldNotifyAcceptedDriver && !driverIds.some((id) => id.toString() === preCancelAcceptedDriverId.toString())) {
          driverIds.push(preCancelAcceptedDriverId);
        }
        if (driverIds.length) {
          const drivers = await Driver.find({ _id: { $in: driverIds } }).select('_id userId').lean();
          for (const driver of drivers) {
            emitToUser('driver', driver.userId.toString(), 'ride:unavailable', {
              rideRequestId: rideRequest._id,
              message: preCancelAcceptedDriverId && driver._id.toString() === preCancelAcceptedDriverId.toString()
                ? 'Customer cancelled the ride'
                : 'The ride you were offered has been cancelled',
            });
          }
        }

        if (preCancelAcceptedDriverId && !rideRequest.shuttleSessionId) {
          await Driver.findByIdAndUpdate(preCancelAcceptedDriverId, {
            isAvailable: true,
          });
          ridePairing.clearPairing(preCancelAcceptedDriverId.toString(), rideRequest.customerId.toString());
        }

        io.of('/sockets/admin').emit('ride:update', {
          rideRequestId: rideRequest._id,
          status: 'CANCELLED',
        });

        socket.emit('ride:cancel:ack', { 
          success: true,
          cancellationFee: cancellationFee,
          message: cancellationFee > 0 
            ? `Ride cancelled. A cancellation fee of ₹${cancellationFee} has been charged.`
            : 'Ride cancelled successfully.'
        });
      } catch (err) {
        logger.error('ride:cancel error', { error: err.message });
        socket.emit('ride:cancel:error', { message: 'Failed to cancel ride' });
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Customer ${socket.userId} disconnected`);
    });
  });
}

module.exports = { registerCustomerEvents };
