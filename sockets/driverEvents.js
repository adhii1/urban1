const Driver = require('../models/Driver');
const RideRequest = require('../models/RideRequest');
const ShuttleSession = require('../models/ShuttleSession');
const { emitToUser, activeSockets } = require('../config/socket');
const logger = require('../utils/logger');
const { generateOtp } = require('../utils/otpHelper');
const ridePairing = require('../services/ridePairingService');
const shuttleService = require('../services/shuttleService');
const { validateSocketEvent, schemas } = require('../validations/socketValidation');
const { haversineKm, calculateFinalFare } = require('../services/fareService');
const {
  driverLocationLimiter,
  driverOnlineLimiter,
  rideActionLimiter,
  otpVerifyLimiter,
} = require('../utils/socketRateLimiter');
const { reject, rateLimited } = require('./socketHelpers');
const shuttleLifecycleService = require('../services/shuttleLifecycleService');

function lifecycleErrorPayload(error, context = {}) {
  return {
    success: false,
    code: error?.code || 'SHUTTLE_OPERATION_FAILED',
    message: error?.message || 'Shuttle operation could not be completed',
    ...context,
  };
}

function emitLifecycleError(socket, event, error, context) {
  logger.warn(`${event} rejected`, { code: error?.code, error: error?.message, ...context });
  socket.emit(`${event}:error`, lifecycleErrorPayload(error, context));
}

async function handleShuttleAccept(socket, io, userId, data, event = 'shuttle:accept') {
  const v = validateShuttleAccept(data);
  if (!v.valid) return emitLifecycleError(socket, event, { code: 'INVALID_PAYLOAD', message: 'A non-empty bundle of ride request identifiers is required' });
  if (rateLimited(socket, event, rideActionLimiter, `${event}:error`, 'Too many requests')) return;

  try {
    const { rideRequestIds } = v.value;
    const driver = await Driver.findOne({ userId }).select('_id isAvailable vehicleCapacity currentLocation name vehicleNumber vehicleModel userId').lean();
    if (!driver) return emitLifecycleError(socket, event, { code: 'DRIVER_NOT_FOUND', message: 'Driver profile not found' });
    if (!driver.isAvailable) return emitLifecycleError(socket, event, { code: 'DRIVER_UNAVAILABLE', message: 'Driver is not available to accept rides' });
    if (rideRequestIds.length > (driver.vehicleCapacity || 6)) {
      return emitLifecycleError(socket, event, { code: 'CAPACITY_EXCEEDED', message: 'Requested rides exceed vehicle capacity' });
    }

    const existingShuttle = await shuttleService.getActiveShuttleForDriver(driver._id);
    if (existingShuttle) {
      return emitLifecycleError(socket, event, { code: 'SHUTTLE_ALREADY_ACTIVE', message: 'Driver already has an active shuttle session' });
    }

    const result = await shuttleLifecycleService.acceptBundle({
      driverId: driver._id,
      rideRequestIds,
      driverLocation: driver.currentLocation,
    });
    await Driver.findByIdAndUpdate(driver._id, { $set: { isAvailable: false } });

    for (const ride of result.acceptedRides) {
      await ridePairing.setPairing(driver._id.toString(), ride.customerId.toString());
      emitToUser('customer', ride.customerId.toString(), 'ride:accepted', {
        rideRequestId: ride._id,
        shuttleSessionId: result.shuttleSession._id,
        isShuttle: true,
        driver: { id: driver._id, name: driver.name, vehicleNumber: driver.vehicleNumber, vehicleModel: driver.vehicleModel },
        otp: ride.otp?.code,
        pickup: ride.pickupLocation,
        drop: ride.dropLocation,
      });
    }

    io.of('/sockets/admin').emit('shuttle:new', {
      shuttleSessionId: result.shuttleSession._id,
      driverId: driver._id,
      rideCount: result.passengers.length,
    });

    // Preserve the established driver-client contract while keeping the
    // lifecycle service's durable ShuttleSession and per-passenger projection
    // authoritative. The legacy client cannot retain an accepted shuttle
    // without `shuttle` and `rides`, while newer clients consume the explicit
    // `shuttleSession` and `passengers` fields.
    const rides = result.passengers.map((passenger) => ({
      ...passenger,
      customerName: passenger.passengerName,
      stops: [],
    }));
    socket.emit(`${event}:ack`, {
      success: true,
      shuttleSessionId: result.shuttleSession._id.toString(),
      shuttleSession: result.shuttleSession,
      shuttle: result.shuttleSession,
      passengers: result.passengers,
      rides,
      passengerCount: result.passengers.length,
      navigationUrl: result.shuttleSession.navigationUrl,
    });
  } catch (error) {
    emitLifecycleError(socket, event, error);
  }
}

async function handleShuttlePickupVerify(socket, io, userId, data, event = 'shuttle:pickup-verify') {
  const v = validateShuttlePickupVerify(data);
  if (!v.valid) return emitLifecycleError(socket, event, { code: 'INVALID_PAYLOAD', message: 'shuttleSessionId, rideRequestId, and OTP are required' });
  if (rateLimited(socket, event, otpVerifyLimiter, `${event}:error`, 'Too many OTP attempts')) return;

  const { shuttleSessionId, rideRequestId, otp } = v.value;
  try {
    const driver = await Driver.findOne({ userId }).select('_id').lean();
    if (!driver) return emitLifecycleError(socket, event, { code: 'DRIVER_NOT_FOUND', message: 'Driver profile not found' }, { shuttleSessionId, rideRequestId });
    const result = await shuttleLifecycleService.verifyPassengerPickup({ driverId: driver._id, shuttleSessionId, rideRequestId, otp });
    const passengers = await shuttleLifecycleService.getDriverPassengerProjection({ driverId: driver._id, shuttleSessionId });

    emitToUser('customer', result.passenger.customerId, 'ride:started', { rideRequestId, shuttleSessionId, message: 'You have been picked up! Ride in progress.' });
    io.of('/sockets/admin').emit('ride:update', { rideRequestId, status: 'IN_PROGRESS' });
    socket.emit(`${event}:ack`, { success: true, shuttleSessionId, rideRequestId, passenger: result.passenger, passengers });
  } catch (error) {
    emitLifecycleError(socket, event, error, { shuttleSessionId, rideRequestId });
  }
}

async function handleShuttleCompleteDrop(socket, io, userId, data, event = 'shuttle:complete-drop') {
  const v = validateShuttleCompleteDrop(data);
  if (!v.valid) return emitLifecycleError(socket, event, { code: 'INVALID_PAYLOAD', message: 'shuttleSessionId and rideRequestId are required' });
  if (rateLimited(socket, event, rideActionLimiter, `${event}:error`, 'Too many requests')) return;

  const { shuttleSessionId, rideRequestId } = v.value;
  try {
    const driver = await Driver.findOne({ userId }).select('_id').lean();
    if (!driver) return emitLifecycleError(socket, event, { code: 'DRIVER_NOT_FOUND', message: 'Driver profile not found' }, { shuttleSessionId, rideRequestId });
    const result = await shuttleLifecycleService.completePassengerDrop({ driverId: driver._id, shuttleSessionId, rideRequestId });
    const passengers = await shuttleLifecycleService.getDriverPassengerProjection({ driverId: driver._id, shuttleSessionId });

    ridePairing.clearPairing(driver._id.toString(), result.passenger.customerId);
    emitToUser('customer', result.passenger.customerId, 'ride:completed', { rideRequestId, shuttleSessionId, message: 'You have reached your destination!' });
    io.of('/sockets/admin').emit('ride:update', { rideRequestId, status: 'COMPLETED' });
    if (result.allDropped) await Driver.findByIdAndUpdate(driver._id, { $set: { isAvailable: true } });
    const acknowledgement = {
      success: true,
      shuttleSessionId,
      rideRequestId,
      passenger: result.passenger,
      passengers,
      allDropped: result.allDropped,
      // Legacy driver clients use this spelling to determine whether to
      // release their active shuttle UI after the final passenger drop.
      allDropsCompleted: result.allDropped,
      shuttleStatus: result.shuttleSession.status,
    };
    socket.emit(`${event}:ack`, acknowledgement);
    if (result.allDropped && event === 'shuttle:complete-drop') {
      socket.emit('shuttle:complete:ack', { success: true, allDropsCompleted: true, shuttleSessionId });
    }
  } catch (error) {
    emitLifecycleError(socket, event, error, { shuttleSessionId, rideRequestId });
  }
}

const validateRideAccept = validateSocketEvent(schemas.rideAccept);
const validateRideHeadToPickup = validateSocketEvent(schemas.rideHeadToPickup);
const validateRideReject = validateSocketEvent(schemas.rideReject);
const validateVerifyOtp = validateSocketEvent(schemas.verifyOtp);
const validateRideComplete = validateSocketEvent(schemas.rideComplete);
const validateRideCancel = validateSocketEvent(schemas.rideCancel);
const validateDriverOnline = validateSocketEvent(schemas.driverOnline);
const validateDriverLocation = validateSocketEvent(schemas.driverLocation);
const validateShuttleListing = validateSocketEvent(schemas.shuttleListing);
const validateShuttleAccept = validateSocketEvent(schemas.shuttleAccept);
const validateShuttlePickupVerify = validateSocketEvent(schemas.shuttlePickupVerify);
const validateShuttleCompleteDrop = validateSocketEvent(schemas.shuttleCompleteDrop);
const validateShuttleNavigate = validateSocketEvent(schemas.shuttleNavigate);
const validateShuttleCancel = validateSocketEvent(schemas.shuttleCancel);

function registerDriverEvents(io) {
  const driverNamespace = io.of('/sockets/driver');

  driverNamespace.on('connection', (socket) => {
    socket.on('driver:shuttle:accept', (data) => handleShuttleAccept(socket, io, socket.userId, data, 'driver:shuttle:accept'));
    socket.on('driver:shuttle:pickup-verify', (data) => handleShuttlePickupVerify(socket, io, socket.userId, data, 'driver:shuttle:pickup-verify'));
    socket.on('driver:shuttle:complete-drop', (data) => handleShuttleCompleteDrop(socket, io, socket.userId, data, 'driver:shuttle:complete-drop'));

    socket.on('driver:online', async (data) => {
      const userId = socket.userId;
      try {
        if (rateLimited(socket, 'driver:online', driverOnlineLimiter, 'driver:error', 'Too many online requests')) return;
        const v = validateDriverOnline(data);
        if (!v.valid) return reject(socket, 'driver:error', v.error, 'Invalid location');
        const { latitude, longitude } = v.value;

        const driver = await Driver.findOne({ userId });
        if (!driver) {
          socket.emit('driver:error', { message: 'Driver profile not found' });
          return;
        }

        // Check if driver is suspended
        if (driver.suspensionUntil && new Date(driver.suspensionUntil) > new Date()) {
          const hoursLeft = Math.ceil((new Date(driver.suspensionUntil).getTime() - Date.now()) / (60 * 60 * 1000));
          socket.emit('driver:error', {
            message: `Your account is suspended. Try again in ${hoursLeft} hour(s).`,
            suspended: true,
            suspensionUntil: driver.suspensionUntil,
          });
          return;
        }

        // Check if driver status is PENDING_APPROVAL
        if (driver.status === 'PENDING_APPROVAL') {
          socket.emit('driver:error', {
            message: 'Your account is pending admin approval. Please wait.',
            pendingApproval: true,
          });
          return;
        }

        // If this driver has an active ride, they should be online but not
        // available for new requests.
        // However, detect and auto-cleanup stale rides that were never
        // completed (e.g., after a browser crash or abandoned session).
        let isAvailable = true;
        const NOW = new Date();
        const STALE_ACCEPTED_MS = 2 * 60 * 1000;  // 2 min: ACCEPTED/DRIVER_ARRIVING without progress
        const STALE_IN_PROGRESS_MS = 5 * 60 * 1000; // 5 min: IN_PROGRESS without completion

        const activeRide = await RideRequest.findOne({
          acceptedDriverId: driver._id,
          status: { $in: ['ACCEPTED', 'DRIVER_ARRIVING', 'IN_PROGRESS'] },
          isDeleted: false,
        }).select('_id status acceptedAt updatedAt customerId').lean();

        if (activeRide) {
          const elapsed = NOW.getTime() - (activeRide.updatedAt || activeRide.acceptedAt || NOW).getTime();
          const isStale =
            (['ACCEPTED', 'DRIVER_ARRIVING'].includes(activeRide.status) && elapsed > STALE_ACCEPTED_MS) ||
            (activeRide.status === 'IN_PROGRESS' && elapsed > STALE_IN_PROGRESS_MS);

          if (isStale) {
            logger.warn(`Auto-expiring stale ride ${activeRide._id} for driver ${userId} (status: ${activeRide.status}, elapsed: ${Math.round(elapsed / 1000)}s)`);
            await RideRequest.findByIdAndUpdate(activeRide._id, {
              $set: { status: 'EXPIRED', ttlAt: NOW },
            });
            ridePairing.clearPairing(driver._id.toString(), activeRide.customerId?.toString());
            isAvailable = true;
          } else {
            isAvailable = false;
          }
        }

        await Driver.findOneAndUpdate(
          { userId },
          {
            isOnline: true,
            isAvailable,
            currentLocation: {
              type: 'Point',
              coordinates: [longitude, latitude],
            },
          }
        );
        logger.info(`Driver ${userId} online at [${longitude}, ${latitude}]${activeRide && !isAvailable ? ' (has active ride)' : ''}`);
        socket.emit('driver:online:ack', { success: true });
      } catch (err) {
        logger.error('driver:online error', { error: err.message });
        socket.emit('driver:error', { message: 'Failed to go online' });
      }
    });

    socket.on('driver:offline', async () => {
      const userId = socket.userId;
      try {
        await Driver.findOneAndUpdate(
          { userId },
          { isOnline: false, isAvailable: false }
        );
        socket.emit('driver:offline:ack', { success: true });
      } catch (err) {
        logger.error('driver:offline error', { error: err.message });
      }
    });

    socket.on('driver:location', async (data) => {
      const userId = socket.userId;
      try {
        if (rateLimited(socket, 'driver:location', driverLocationLimiter, 'driver:error', 'Too many location updates')) return;
        const v = validateDriverLocation(data);
        if (!v.valid) return;
        const { latitude, longitude } = v.value;
        const driver = await Driver.findOneAndUpdate(
          { userId },
          {
            currentLocation: {
              type: 'Point',
              coordinates: [longitude, latitude],
            },
          },
          { new: true, select: '_id currentLocation' }
        );

        if (!driver) return;

        const customers = ridePairing.getCustomersForDriver(driver._id.toString());

        const driverCoords = [longitude, latitude];
        const payload = {
          driverId: driver._id.toString(),
          coordinates: driverCoords,
          timestamp: new Date(),
        };

        const shuttle = await shuttleService.getActiveShuttleForDriver(driver._id);
        if (shuttle) {
          for (const rideId of shuttle.rideRequestIds) {
            const ride = await RideRequest.findById(rideId).select('customerId status pickupLocation dropLocation').lean();
            if (ride && ride.customerId) {
              const customerIdStr = ride.customerId.toString();
              if (!customers.includes(customerIdStr)) {
                customers.push(customerIdStr);
              }
              if (ride.status === 'DRIVER_ARRIVING' || ride.status === 'IN_PROGRESS') {
                const { estimateEtaMinutes, haversineKm: haversine } = require('../utils/geoHelper');
                if (ride.status === 'DRIVER_ARRIVING') {
                  const etaToPickup = estimateEtaMinutes(driverCoords, ride.pickupLocation?.coordinates);
                  emitToUser('customer', customerIdStr, 'driver:location:update', {
                    ...payload,
                    etaMinutes: etaToPickup,
                    etaType: 'pickup',
                  });
                } else if (ride.status === 'IN_PROGRESS') {
                  const etaToDrop = estimateEtaMinutes(driverCoords, ride.dropLocation?.coordinates);
                  const distanceToDrop = haversine(driverCoords, ride.dropLocation?.coordinates);
                  emitToUser('customer', customerIdStr, 'driver:location:update', {
                    ...payload,
                    etaMinutes: etaToDrop,
                    distanceKm: Math.round(distanceToDrop * 100) / 100,
                    etaType: 'drop',
                  });
                }
              }
            }
          }
        }

        const activeRide = await RideRequest.findOne({
          acceptedDriverId: driver._id,
          shuttleSessionId: { $exists: false },
          status: { $in: ['DRIVER_ARRIVING', 'IN_PROGRESS'] },
          isDeleted: false,
        }).select('pickupLocation dropLocation status').lean();

        if (activeRide) {
          const { estimateEtaMinutes, haversineKm: haversine } = require('../utils/geoHelper');
          if (activeRide.status === 'DRIVER_ARRIVING') {
            const etaToPickup = estimateEtaMinutes(driverCoords, activeRide.pickupLocation.coordinates);
            payload.etaMinutes = etaToPickup;
            payload.etaType = 'pickup';
          } else if (activeRide.status === 'IN_PROGRESS') {
            const etaToDrop = estimateEtaMinutes(driverCoords, activeRide.dropLocation.coordinates);
            const distanceToDrop = haversine(driverCoords, activeRide.dropLocation.coordinates);
            payload.etaMinutes = etaToDrop;
            payload.distanceKm = Math.round(distanceToDrop * 100) / 100;
            payload.etaType = 'drop';
          }
        }

        for (const customerId of customers) {
          emitToUser('customer', customerId, 'driver:location:update', payload);
        }
      } catch (err) {
        logger.error('driver:location error', { error: err.message });
      }
    });

    socket.on('ride:accept', async (data) => {
      const userId = socket.userId;
      try {
        if (rateLimited(socket, 'ride:accept', rideActionLimiter, 'ride:accept:error', 'Too many requests')) return;
        const v = validateRideAccept(data);
        if (!v.valid) return reject(socket, 'ride:accept:error', v.error, 'Invalid ride id');
        const { rideRequestId } = v.value;

        const driver = await Driver.findOne({ userId }).select('_id');
        if (!driver) {
          socket.emit('ride:accept:error', { message: 'Driver profile not found' });
          return;
        }

        // Bundled offers must enter through the transactional lifecycle
        // service before this legacy single-ride path locks or mutates state.
        // The service returns the same `ride:accept:*` event contract, with
        // a durable session and authoritative passenger projection.
        const offeredRide = await RideRequest.findOne({
          _id: rideRequestId,
          status: 'PENDING',
          isDeleted: false,
          matchedDrivers: {
            $elemMatch: {
              driverId: driver._id,
              response: { $ne: 'ACCEPTED' },
            },
          },
        }).select('_id isBundled bundleId').lean();
        if (offeredRide?.isBundled) {
          if (!offeredRide.bundleId) {
            socket.emit('ride:accept:error', { success: false, code: 'INVALID_BUNDLE', message: 'Bundled ride is missing its bundle identifier' });
            return;
          }
          const bundle = await RideRequest.find({
            bundleId: offeredRide.bundleId,
            status: 'PENDING',
            isDeleted: false,
            shuttleSessionId: { $exists: false },
          }).select('_id').lean();
          if (bundle.length === 0) {
            socket.emit('ride:accept:error', { success: false, code: 'RIDES_UNAVAILABLE', message: 'Bundle is no longer available' });
            return;
          }
          return handleShuttleAccept(
            socket,
            io,
            userId,
            { rideRequestIds: bundle.map((ride) => ride._id.toString()) },
            'ride:accept'
          );
        }

        // Step 1: Atomically lock the driver as unavailable. If another
        // process already set isAvailable: false (race or double-accept),
        // this returns null and we reject. This avoids the two-step
        // crash-window where the ride is ACCEPTED but the driver remains
        // available — the worst crash leaves the driver unavailable (safe
        // fail) rather than double-booked.
        const locked = await Driver.findOneAndUpdate(
          { userId, isAvailable: true },
          { $set: { isAvailable: false } }
        );
        if (!locked) {
          socket.emit('ride:accept:error', { message: 'You already have an active ride' });
          return;
        }

        // Step 2: Atomically accept the ride (and check if it's bundled).
        const pendingRide = await RideRequest.findOne({
          _id: rideRequestId,
          status: 'PENDING',
          matchedDrivers: {
            $elemMatch: {
              driverId: driver._id,
              response: { $ne: 'ACCEPTED' },
            },
          },
        }).lean();

        if (!pendingRide) {
          // Revert the lock
          await Driver.findOneAndUpdate({ userId }, { $set: { isAvailable: true } });
          socket.emit('ride:accept:error', {
            message: 'Ride request no longer available',
          });
          return;
        }

        if (pendingRide.isBundled && pendingRide.bundleId) {
          // This is a bundled ride. Find all rides in this bundle.
          const bundledRides = await RideRequest.find({
            bundleId: pendingRide.bundleId,
            status: 'PENDING',
            isDeleted: false
          }).lean();

          if (bundledRides.length > 0) {
            try {
              const shuttle = await shuttleService.createShuttleSession(
                driver._id,
                bundledRides.map(r => r._id),
                driver.currentLocation || { coordinates: [0, 0] }
              );

              logger.info('[BUNDLE_DEBUG] Driver accepted bundle', {
                DriverId: driver._id,
                RideRequestId: rideRequestId,
                BundleId: pendingRide.bundleId,
                BundleSize: bundledRides.length
              });
              logger.info('[BUNDLE_DEBUG] Bundle status updated', {
                BundleId: pendingRide.bundleId,
                OldStatus: 'PENDING',
                NewStatus: 'ACCEPTED'
              });

              console.log('[EXECUTION_TRACE] ride:accept', {
                incomingRideRequestId: rideRequestId,
                shuttleSessionFound: true,
                shuttleSessionId: shuttle._id,
                bundleId: pendingRide.bundleId,
                rideRequestCount: bundledRides.length,
                rideRequestIds: bundledRides.map(r => r._id.toString()),
                selectedRideRequestId: rideRequestId,
                storedOtp: 'N/A',
                otpEntered: 'N/A',
                otpComparisonResult: 'N/A',
                rideRequestStatusBefore: 'PENDING',
                rideRequestStatusAfter: 'ACCEPTED',
                shuttleSessionStatusBefore: 'N/A',
                shuttleSessionStatusAfter: 'ACCEPTED'
              });

              const fullDriver = await Driver.findById(driver._id).populate('userId', 'phone').lean();
              const { estimateEtaMinutes } = require('../utils/geoHelper');
              const driverCoords = fullDriver.currentLocation?.coordinates;

              for (const ride of bundledRides) {
                await ridePairing.setPairing(driver._id.toString(), ride.customerId.toString());

                let otpCode = ride.otp?.code;
                if (!otpCode) {
                  otpCode = generateOtp();
                  await RideRequest.findByIdAndUpdate(ride._id, {
                    $set: {
                      otp: {
                        code: otpCode,
                        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
                        verified: false,
                      },
                    },
                  });
                }

                const etaMinutes = driverCoords && ride.pickupLocation?.coordinates
                  ? estimateEtaMinutes(driverCoords, ride.pickupLocation.coordinates)
                  : null;

                logger.info('[BUNDLE_ACCEPT]', {
                  rideRequestId: ride._id,
                  customerId: ride.customerId,
                  'pickup coordinates': ride.pickupLocation?.coordinates,
                  'drop coordinates': ride.dropLocation?.coordinates,
                  otp: otpCode,
                });

                emitToUser('customer', ride.customerId.toString(), 'ride:accepted', {
                  rideRequestId: ride._id,
                  driver: {
                    id: driver._id,
                    name: fullDriver.name,
                    phone: fullDriver.userId?.phone,
                    vehicleNumber: fullDriver.vehicleNumber,
                    vehicleModel: fullDriver.vehicleModel,
                    currentLocation: fullDriver.currentLocation,
                  },
                  otp: otpCode,
                  etaMinutes,
                  pickup: ride.pickupLocation,
                  drop: ride.dropLocation,
                  shuttleSessionId: shuttle._id,
                });

                // Notify losing drivers
                const losingDriverIds = ride.matchedDrivers
                  .filter((d) => d.driverId && d.driverId.toString() !== driver._id.toString())
                  .map((d) => d.driverId);
                if (losingDriverIds.length > 0) {
                  const losingDrivers = await Driver.find({ _id: { $in: losingDriverIds } }).select('userId').lean();
                  for (const ld of losingDrivers) {
                    if (ld.userId) {
                      emitToUser('driver', ld.userId.toString(), 'ride:unavailable', {
                        rideRequestId: ride._id,
                        message: 'This ride has been accepted by another driver',
                      });
                    }
                  }
                }
              }

              // Print [BUNDLE_STATE]
              const ridesState = await RideRequest.find({ shuttleSessionId: shuttle._id }).lean();
              logger.info('[BUNDLE_STATE]', {
                shuttleSessionStatus: shuttle.status,
                rideRequestStatuses: ridesState.map(r => ({ rideRequestId: r._id, status: r.status }))
              });

              io.of('/sockets/admin').emit('shuttle:new', {
                shuttleSessionId: shuttle._id,
                driverId: driver._id,
                rideCount: bundledRides.length,
              });

              // Structured per-passenger list — one entry per ride in the
              // bundle, each with its own OTP/pickup/drop, freshly re-read
              // so it reflects the OTPs generated in the loop above.
              // Without this, the driver app only receives shuttleSessionId
              // and has no source for distinct passenger cards/OTPs.
              const acceptedRides = await RideRequest.find({ _id: { $in: bundledRides.map(r => r._id) } })
                .select('_id customerId customerName pickupLocation dropLocation fare otp')
                .lean();
              const passengers = acceptedRides.map((r) => ({
                rideRequestId: r._id,
                customerName: r.customerName,
                pickup: r.pickupLocation,
                drop: r.dropLocation,
                otp: r.otp?.code,
                fareEstimate: r.fare?.estimated,
              }));

              // Respond to the driver
              socket.emit('ride:accept:ack', {
                success: true,
                rideRequestId: rideRequestId,
                shuttleSessionId: shuttle._id,
                shuttle,
                rides: acceptedRides,
                passengers,
                passengerCount: passengers.length,
                navigationUrl: shuttle.navigationUrl,
                message: 'Bundle accepted successfully.'
              });
              return;

            } catch (err) {
              await Driver.findOneAndUpdate({ userId }, { $set: { isAvailable: true } });
              logger.error('Failed to create shuttle from bundle', { error: err.message });
              socket.emit('ride:accept:error', { message: 'Failed to accept bundle' });
              return;
            }
          }
        }

        if (pendingRide.isBundled) {
          console.error('[BUNDLE_ERROR] Fell back to primary RideRequest');
          console.error('[BUNDLE_ERROR] ShuttleSession not found');
        }

        const otpCode = generateOtp();
        const rideRequest = await RideRequest.findOneAndUpdate(
          {
            _id: rideRequestId,
            status: 'PENDING',
            matchedDrivers: {
              $elemMatch: {
                driverId: driver._id,
                response: { $ne: 'ACCEPTED' },
              },
            },
          },
          {
            $set: {
              status: 'ACCEPTED',
              acceptedDriverId: driver._id,
              acceptedAt: new Date(),
              otp: {
                code: otpCode,
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
                verified: false,
              },
              'matchedDrivers.$[elem].response': 'ACCEPTED',
              'matchedDrivers.$[elem].respondedAt': new Date(),
            },
          },
          {
            new: true,
            arrayFilters: [{ 'elem.driverId': driver._id }],
          }
        );

        if (!rideRequest) {
          // Step 2b: Revert the lock — mark driver available again.
          await Driver.findOneAndUpdate({ userId }, { $set: { isAvailable: true } });
          socket.emit('ride:accept:error', {
            message: 'Ride request no longer available',
          });
          return;
        }

        // Step 3: Load full driver details for customer notification.
        const fullDriver = await Driver.findById(driver._id).populate('userId', 'phone').lean();
        if (!fullDriver) {
          // Should not happen, but undo if it does.
          await Driver.findOneAndUpdate({ userId }, { $set: { isAvailable: true } });
          socket.emit('ride:accept:error', { message: 'Driver profile not found' });
          return;
        }

        // Step 4: Update pairing map.
        ridePairing.setPairing(driver._id.toString(), rideRequest.customerId.toString());

        // Step 5: Notify the customer.
        const { estimateEtaMinutes } = require('../utils/geoHelper');
        const driverCoords = fullDriver.currentLocation?.coordinates;
        const etaMinutes = driverCoords ? estimateEtaMinutes(driverCoords, rideRequest.pickupLocation.coordinates) : null;

        emitToUser('customer', rideRequest.customerId.toString(), 'ride:accepted', {
          rideRequestId: rideRequest._id,
          driver: {
            id: fullDriver._id,
            name: fullDriver.name,
            phone: fullDriver.userId && fullDriver.userId.phone,
            vehicleNumber: fullDriver.vehicleNumber,
            vehicleModel: fullDriver.vehicleModel,
            currentLocation: fullDriver.currentLocation,
          },
          otp: otpCode,
          etaMinutes,
          pickup: rideRequest.pickupLocation,
          drop: rideRequest.dropLocation,
        });

        // Step 6: Notify losing drivers.
        const losingDriverIds = rideRequest.matchedDrivers
          .filter((d) => d.driverId && d.driverId.toString() !== driver._id.toString())
          .map((d) => d.driverId);

        if (losingDriverIds.length > 0) {
          const losingDrivers = await Driver.find({ _id: { $in: losingDriverIds } })
            .select('userId')
            .lean();
          for (const ld of losingDrivers) {
            if (ld.userId) {
              emitToUser('driver', ld.userId.toString(), 'ride:unavailable', {
                rideRequestId: rideRequest._id,
                message: 'This ride has been accepted by another driver',
              });
            }
          }
        }

        // Step 7: Notify admin.
        io.of('/sockets/admin').emit('ride:update', {
          rideRequestId: rideRequest._id,
          status: 'ACCEPTED',
          driverId: driver._id,
        });

        socket.emit('ride:accept:ack', {
          success: true,
          rideRequestId: rideRequest._id,
          fareEstimate: rideRequest.fare?.estimated,
          tripDistance: rideRequest.fare?.details?.distanceKm,
          passengers: [{
            rideRequestId: rideRequest._id,
            customerName: rideRequest.customerName,
            pickup: rideRequest.pickupLocation,
            drop: rideRequest.dropLocation,
            otp: otpCode,
            fareEstimate: rideRequest.fare?.estimated,
          }],
        });
      } catch (err) {
        logger.error('ride:accept error', { error: err.message });
        socket.emit('ride:accept:error', { message: 'Failed to accept ride' });
      }
    });

    socket.on('ride:head-to-pickup', async (data) => {
      const userId = socket.userId;
      try {
        if (rateLimited(socket, 'ride:head-to-pickup', rideActionLimiter, 'ride:head-to-pickup:error', 'Too many requests')) return;
        const v = validateRideHeadToPickup(data);
        if (!v.valid) return reject(socket, 'ride:head-to-pickup:error', v.error, 'Invalid ride id');
        const { rideRequestId } = v.value;

        const driver = await Driver.findOne({ userId }).select('_id currentLocation');
        if (!driver) {
          socket.emit('ride:head-to-pickup:error', { message: 'Driver profile not found' });
          return;
        }

        // Resolve ShuttleSession
        let rideRequest = await RideRequest.findOne({ _id: rideRequestId, acceptedDriverId: driver._id });
        if (!rideRequest) {
          socket.emit('ride:head-to-pickup:error', { message: 'Ride not found or not assigned to you' });
          return;
        }

        if (rideRequest.shuttleSessionId) {
          const shuttleBefore = await ShuttleSession.findById(rideRequest.shuttleSessionId).lean();
          const shuttle = await ShuttleSession.findOneAndUpdate(
            { _id: rideRequest.shuttleSessionId, driverId: driver._id, status: 'ACCEPTED' },
            { $set: { status: 'ARRIVING' } },
            { new: true }
          );

          if (!shuttle) {
            console.error('[BUNDLE_ERROR] ShuttleSession not found');
            socket.emit('ride:head-to-pickup:error', { message: 'Shuttle session not found or not in ACCEPTED status' });
            return;
          }

          console.log('[EXECUTION_TRACE] ride:head-to-pickup', {
            incomingRideRequestId: rideRequestId,
            shuttleSessionFound: true,
            shuttleSessionId: shuttle._id,
            bundleId: rideRequest.bundleId,
            rideRequestCount: shuttle.rideRequestIds.length,
            rideRequestIds: shuttle.rideRequestIds.map(id => id.toString()),
            selectedRideRequestId: rideRequestId,
            storedOtp: 'N/A',
            otpEntered: 'N/A',
            otpComparisonResult: 'N/A',
            rideRequestStatusBefore: 'ACCEPTED',
            rideRequestStatusAfter: 'DRIVER_ARRIVING',
            shuttleSessionStatusBefore: shuttleBefore?.status || 'ACCEPTED',
            shuttleSessionStatusAfter: 'ARRIVING'
          });

          logger.info('[BUNDLE_DEBUG] Bundle status updated', {
            BundleId: shuttle._id,
            OldStatus: 'ACCEPTED',
            NewStatus: 'ARRIVING'
          });

          await RideRequest.updateMany(
            { shuttleSessionId: shuttle._id, status: 'ACCEPTED' },
            { $set: { status: 'DRIVER_ARRIVING' } }
          );

          // Print [BUNDLE_STATE]
          const rides = await RideRequest.find({ shuttleSessionId: shuttle._id }).lean();
          logger.info('[BUNDLE_STATE]', {
            shuttleSessionStatus: shuttle.status,
            rideRequestStatuses: rides.map(r => ({ rideRequestId: r._id, status: r.status }))
          });

          // Re-fetch to have the updated status for the primary ride
          rideRequest.status = 'DRIVER_ARRIVING';
        } else {
          if (rideRequest.isBundled) {
            console.error('[BUNDLE_ERROR] Fell back to primary RideRequest');
            console.error('[BUNDLE_ERROR] ShuttleSession not found');
          }
          // Single ride fallback
          rideRequest = await RideRequest.findOneAndUpdate(
            { _id: rideRequestId, status: 'ACCEPTED', acceptedDriverId: driver._id },
            { $set: { status: 'DRIVER_ARRIVING' } },
            { new: true }
          );
          if (!rideRequest) {
            socket.emit('ride:head-to-pickup:error', { message: 'Ride not found or not in ACCEPTED status' });
            return;
          }
        }

        const { estimateEtaMinutes } = require('../utils/geoHelper');
        const driverCoords = driver.currentLocation?.coordinates;

        let ridesToNotify = [rideRequest];
        if (rideRequest.shuttleSessionId) {
          ridesToNotify = await RideRequest.find({ shuttleSessionId: rideRequest.shuttleSessionId, status: 'DRIVER_ARRIVING' });
        }

        for (const ride of ridesToNotify) {
          const pickupCoords = ride.pickupLocation.coordinates;
          const etaMinutes = driverCoords ? estimateEtaMinutes(driverCoords, pickupCoords) : null;

          emitToUser('customer', ride.customerId.toString(), 'ride:driver-arriving', {
            rideRequestId: ride._id,
            etaMinutes,
            message: `Driver is on the way! Estimated ${etaMinutes} min to pickup.`,
          });

          io.of('/sockets/admin').emit('ride:update', {
            rideRequestId: ride._id,
            status: 'DRIVER_ARRIVING',
            etaMinutes,
          });
        }

        socket.emit('ride:head-to-pickup:ack', {
          success: true,
          // Calculate max or primary eta to show the driver if needed, but primary is fine here
          etaMinutes: driverCoords ? estimateEtaMinutes(driverCoords, rideRequest.pickupLocation.coordinates) : null,
        });
      } catch (err) {
        logger.error('ride:head-to-pickup error', { error: err.message });
        socket.emit('ride:head-to-pickup:error', { message: 'Failed to update ride status' });
      }
    });

    socket.on('ride:reject', async (data) => {
      const userId = socket.userId;
      try {
        if (rateLimited(socket, 'ride:reject', rideActionLimiter, 'ride:reject:error', 'Too many requests')) return;
        const v = validateRideReject(data);
        if (!v.valid) {
          socket.emit('ride:reject:error', { message: 'Invalid payload' });
          return;
        }
        const { rideRequestId } = v.value;
        const driver = await Driver.findOne({ userId });
        if (!driver) return;

        const updated = await RideRequest.updateMany(
          {
            _id: { $in: [rideRequestId] },
            'matchedDrivers.driverId': driver._id,
          },
          {
            $set: {
              'matchedDrivers.$[elem].response': 'REJECTED',
              'matchedDrivers.$[elem].respondedAt': new Date(),
            },
          },
          {
            arrayFilters: [{ 'elem.driverId': driver._id }],
          }
        );

        if (updated.matchedCount === 0) {
          socket.emit('ride:reject:ack', { success: false, message: 'Ride not found or driver not matched' });
          return;
        }

        // If it was a bundle, also reject the other rides in the bundle for this driver
        const rejectedRide = await RideRequest.findById(rideRequestId).lean();
        if (rejectedRide && rejectedRide.isBundled && rejectedRide.bundleId) {
          logger.info('[BUNDLE_DEBUG] Driver rejected bundle', {
            DriverId: driver._id,
            BundleId: rejectedRide.bundleId
          });
          await RideRequest.updateMany(
            { bundleId: rejectedRide.bundleId, 'matchedDrivers.driverId': driver._id },
            {
              $set: {
                'matchedDrivers.$[elem].response': 'REJECTED',
                'matchedDrivers.$[elem].respondedAt': new Date(),
              },
            },
            { arrayFilters: [{ 'elem.driverId': driver._id }] }
          );
        }

        socket.emit('ride:reject:ack', { success: true });
      } catch (err) {
        logger.error('ride:reject error', { error: err.message });
        socket.emit('ride:reject:error', { message: 'Failed to reject ride' });
      }
    });

    socket.on('ride:verify-otp', async (data) => {
      const userId = socket.userId;
      try {
        if (rateLimited(socket, 'ride:verify-otp', otpVerifyLimiter, 'ride:verify-otp:error', 'Too many OTP attempts')) return;
        const v = validateVerifyOtp(data);
        if (!v.valid) return reject(socket, 'ride:verify-otp:error', v.error, 'Invalid OTP payload');
        const { rideRequestId, otp } = v.value;

        const driver = await Driver.findOne({ userId }).select('_id');
        if (!driver) {
          socket.emit('ride:verify-otp:error', { message: 'Driver profile not found' });
          return;
        }

        // 1. This handler verifies ONLY the rideRequestId the client sent —
        // it must never silently substitute another rideRequestId (e.g. the
        // next pending pickup in a shuttle). Rides that belong to a
        // ShuttleSession must be verified via shuttle:pickup-verify instead,
        // which is explicitly scoped to a shuttleSessionId + rideRequestId
        // pair.
        const originalRide = await RideRequest.findById(rideRequestId).lean();

        if (originalRide && originalRide.shuttleSessionId) {
          socket.emit('ride:verify-otp:error', {
            message: 'This ride is part of a shuttle. Use shuttle:pickup-verify instead.',
            code: 'USE_SHUTTLE_PICKUP_VERIFY',
            shuttleSessionId: originalRide.shuttleSessionId,
          });
          return;
        }

        const targetRideId = rideRequestId;

        // 2. Load the target RideRequest
        let targetRide = await RideRequest.findOne({
          _id: targetRideId,
          status: 'DRIVER_ARRIVING',
          acceptedDriverId: driver._id
        });

        if (!targetRide) {
          // Helpful check for existing states to return proper errors
          const exists = await RideRequest.findById(targetRideId).select('status acceptedDriverId otp').lean();
          if (!exists) {
            socket.emit('ride:verify-otp:error', { message: 'Ride not found' });
          } else if (exists.acceptedDriverId?.toString() !== driver._id.toString()) {
            socket.emit('ride:verify-otp:error', { message: 'Not authorized for this ride' });
          } else if (exists.status === 'IN_PROGRESS') {
            socket.emit('ride:verify-otp:error', { message: 'OTP already verified' });
          } else {
            socket.emit('ride:verify-otp:error', { message: 'Ride is not ready for OTP verification' });
          }
          return;
        }

        const targetRideBeforeStatus = targetRide ? targetRide.status : 'N/A';

        // 3. Verify OTP code
        const storedOtp = targetRide.otp?.code;
        const verificationResult = (storedOtp === otp && (!targetRide.otp.expiresAt || new Date() < targetRide.otp.expiresAt));

        console.log('[EXECUTION_TRACE] ride:verify-otp', {
          incomingRideRequestId: rideRequestId,
          shuttleSessionFound: false,
          shuttleSessionId: 'N/A',
          bundleId: originalRide?.bundleId || 'N/A',
          rideRequestCount: 1,
          rideRequestIds: [rideRequestId],
          selectedRideRequestId: targetRideId,
          storedOtp: storedOtp || 'N/A',
          otpEntered: otp,
          otpComparisonResult: verificationResult ? 'Match' : 'Mismatch',
          rideRequestStatusBefore: targetRideBeforeStatus,
          rideRequestStatusAfter: verificationResult ? 'IN_PROGRESS' : targetRideBeforeStatus,
          shuttleSessionStatusBefore: 'N/A',
          shuttleSessionStatusAfter: 'N/A'
        });

        logger.info('[OTP_VERIFY]', {
          incomingRideRequestId: rideRequestId,
          bundleId: originalRide?.bundleId,
          shuttleSessionId: null,
          otpEntered: otp,
          matchedRideRequestId: targetRideId,
          storedOtp: storedOtp,
          verificationResult: verificationResult ? 'Success' : 'Invalid OTP'
        });

        if (!verificationResult) {
          socket.emit('ride:verify-otp:error', { message: 'Invalid OTP' });
          return;
        }

        // 4. Update the matched RideRequest
        targetRide = await RideRequest.findOneAndUpdate(
          { _id: targetRideId },
          {
            $set: {
              'otp.verified': true,
              status: 'IN_PROGRESS',
              pickupAt: new Date()
            }
          },
          { new: true }
        );

        logger.info('[BUNDLE_DEBUG] OTP Verified', { RideId: targetRideId });
        logger.info('[BUNDLE_DEBUG] Ride Started', { RideId: targetRideId });

        emitToUser('customer', targetRide.customerId.toString(), 'ride:started', {
          rideRequestId: targetRide._id,
          message: 'Your ride has started!',
        });

        io.of('/sockets/admin').emit('ride:update', {
          rideRequestId: targetRide._id,
          status: 'IN_PROGRESS',
        });

        // Calculate initial drop ETA for driver
        const { estimateEtaMinutes, haversineKm: haversine } = require('../utils/geoHelper');
        const driverLocation = await Driver.findById(driver._id).select('currentLocation').lean();
        const driverCoords = driverLocation?.currentLocation?.coordinates;
        const dropCoords = targetRide.dropLocation.coordinates;
        const dropEtaMinutes = driverCoords ? estimateEtaMinutes(driverCoords, dropCoords) : null;
        const dropDistanceKm = driverCoords ? Math.round(haversine(driverCoords, dropCoords) * 100) / 100 : null;

        socket.emit('ride:verify-otp:ack', {
          success: true,
          dropEtaMinutes,
          dropDistanceKm,
        });
      } catch (err) {
        logger.error('ride:verify-otp error', { error: err.message });
        socket.emit('ride:verify-otp:error', { message: 'Verification failed' });
      }
    });

    socket.on('ride:complete', async (data) => {
      const userId = socket.userId;
      try {
        if (rateLimited(socket, 'ride:complete', rideActionLimiter, 'ride:complete:error', 'Too many requests')) return;
        const v = validateRideComplete(data);
        if (!v.valid) return reject(socket, 'ride:complete:error', v.error, 'Invalid ride id');
        const { rideRequestId } = v.value;

        const driver = await Driver.findOne({ userId }).select('_id');
        if (!driver) {
          socket.emit('ride:complete:error', { message: 'Driver profile not found' });
          return;
        }

        const primaryRideRequest = await RideRequest.findOne({ _id: rideRequestId, acceptedDriverId: driver._id });
        if (!primaryRideRequest) {
          socket.emit('ride:complete:error', { message: 'Ride not in progress or not authorized' });
          return;
        }

        // This handler completes ONLY the rideRequestId the client sent —
        // it must never silently substitute another passenger's drop (e.g.
        // "the next pending drop" in a shuttle sequence). Rides that belong
        // to a ShuttleSession must be completed via shuttle:complete-drop
        // instead, which is explicitly scoped to a shuttleSessionId +
        // rideRequestId pair.
        if (primaryRideRequest.shuttleSessionId) {
          socket.emit('ride:complete:error', {
            message: 'This ride is part of a shuttle. Use shuttle:complete-drop instead.',
            code: 'USE_SHUTTLE_COMPLETE_DROP',
            shuttleSessionId: primaryRideRequest.shuttleSessionId,
          });
          return;
        }

        const isLastDrop = true;

        const rideToComplete = await RideRequest.findOneAndUpdate(
          { _id: rideRequestId, status: 'IN_PROGRESS' },
          {
            $set: {
              status: 'COMPLETED',
              completedAt: new Date(),
              ttlAt: new Date(),
            },
          },
          { new: true }
        );

        if (!rideToComplete) {
          socket.emit('ride:complete:error', { message: 'Failed to complete this passenger drop' });
          return;
        }

        console.log('[EXECUTION_TRACE] ride:complete', {
          incomingRideRequestId: rideRequestId,
          shuttleSessionFound: false,
          shuttleSessionId: 'N/A',
          bundleId: primaryRideRequest.bundleId || 'N/A',
          rideRequestCount: 1,
          rideRequestIds: [rideRequestId],
          selectedRideRequestId: rideToComplete._id.toString(),
          storedOtp: 'N/A',
          otpEntered: 'N/A',
          otpComparisonResult: 'N/A',
          rideRequestStatusBefore: 'IN_PROGRESS',
          rideRequestStatusAfter: 'COMPLETED',
          shuttleSessionStatusBefore: 'N/A',
          shuttleSessionStatusAfter: 'N/A'
        });

        logger.info('[BUNDLE_DEBUG] Passenger completed', { RideId: rideToComplete._id });

        await Driver.findOneAndUpdate({ userId }, { isAvailable: true });
        logger.info('[BUNDLE_DEBUG] Driver released', { DriverId: driver._id });

        ridePairing.clearPairing(driver._id.toString(), rideToComplete.customerId.toString());

        const rideDurationMs = rideToComplete.completedAt - rideToComplete.pickupAt;
        const rideDurationMin = Math.round(rideDurationMs / 60000);

        // Calculate final fare based on actual duration and estimated distance
        const estimatedDistance = rideToComplete.fare?.details?.distanceKm || 0;
        const estimatedFare = rideToComplete.fare;
        const finalFare = calculateFinalFare(
          estimatedDistance,
          rideDurationMin,
          estimatedFare,
          rideToComplete.completedAt
        );

        // Update ride request with final fare
        await RideRequest.findByIdAndUpdate(rideToComplete._id, {
          $set: { 'fare.final': finalFare }
        });

        emitToUser('customer', rideToComplete.customerId.toString(), 'ride:completed', {
          rideRequestId: rideToComplete._id,
          message: 'You have reached your destination!',
          durationMinutes: rideDurationMin,
          fare: {
            final: finalFare,
            estimated: estimatedFare?.estimated,
            breakdown: estimatedFare?.breakdown,
            details: estimatedFare?.details,
          },
        });

        io.of('/sockets/admin').emit('ride:update', {
          rideRequestId: rideToComplete._id,
          status: 'COMPLETED',
        });

        // Always ack back so the frontend can proceed
        socket.emit('ride:complete:ack', { success: true, rideRequestId: rideToComplete._id, isLastDrop });
      } catch (err) {
        logger.error('ride:complete error', { error: err.message });
        socket.emit('ride:complete:error', { message: 'Failed to complete ride' });
      }
    });

    socket.on('ride:cancel', async (data) => {
      const userId = socket.userId;
      try {
        if (rateLimited(socket, 'ride:cancel', rideActionLimiter, 'ride:cancel:error', 'Too many requests')) return;
        const v = validateRideCancel(data);
        if (!v.valid) return reject(socket, 'ride:cancel:error', v.error, 'Invalid cancel payload');
        const { rideRequestId, reason } = v.value;

        const driver = await Driver.findOne({ userId }).select('_id');
        if (!driver) {
          socket.emit('ride:cancel:error', { message: 'Driver profile not found' });
          return;
        }

        // Atomic cancel: check status + driver ownership in one operation.
        let primaryRideRequest = await RideRequest.findOne({
          _id: rideRequestId,
          status: { $in: ['ACCEPTED', 'DRIVER_ARRIVING', 'IN_PROGRESS'] },
          acceptedDriverId: driver._id,
        });

        if (!primaryRideRequest) {
          socket.emit('ride:cancel:error', { message: 'Cannot cancel ride in current status or not authorized' });
          return;
        }

        let ridesToCancel = [primaryRideRequest];
        if (primaryRideRequest.shuttleSessionId) {
          await ShuttleSession.updateOne(
            { _id: primaryRideRequest.shuttleSessionId },
            { $set: { status: 'CANCELLED' } }
          );

          ridesToCancel = await RideRequest.find({
            shuttleSessionId: primaryRideRequest.shuttleSessionId,
            status: { $in: ['ACCEPTED', 'DRIVER_ARRIVING', 'IN_PROGRESS'] }
          });
        }

        for (const ride of ridesToCancel) {
          await RideRequest.findByIdAndUpdate(ride._id, {
            $set: {
              status: 'CANCELLED',
              cancelledAt: new Date(),
              cancelReason: reason || 'Driver cancelled',
              ttlAt: new Date(),
              isBundled: false,
              bundleId: null,
            },
            $unset: { shuttleSessionId: 1 }
          });

          ridePairing.clearPairing(driver._id.toString(), ride.customerId.toString());

          emitToUser('customer', ride.customerId.toString(), 'ride:cancelled', {
            rideRequestId: ride._id,
            message: 'Driver cancelled the ride. Finding another driver...',
          });

          io.of('/sockets/admin').emit('ride:update', {
            rideRequestId: ride._id,
            status: 'CANCELLED',
          });
        }

        await Driver.findOneAndUpdate({ userId }, { isAvailable: true });

        // Track driver cancellation and check for suspension
        await Driver.findByIdAndUpdate(driver._id, {
          $inc: { cancellationCount: 1 },
          $set: { lastCancellationAt: new Date() }
        });

        // Auto-suspend driver if they have too many cancellations (3+ in last 24 hours)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentCancellations = await RideRequest.countDocuments({
          acceptedDriverId: driver._id,
          status: 'CANCELLED',
          cancelledAt: { $gte: oneDayAgo }
        });

        if (recentCancellations >= 3) {
          const suspensionDuration = 24 * 60 * 60 * 1000; // 24 hours
          const suspensionUntil = new Date(Date.now() + suspensionDuration);
          await Driver.findByIdAndUpdate(driver._id, {
            $set: { suspensionUntil }
          });
          emitToUser('driver', userId.toString(), 'driver:suspended', {
            message: `You have been suspended for 24 hours due to frequent cancellations`,
            suspensionUntil
          });
        }

        socket.emit('ride:cancel:ack', { success: true });

        // Automatic re-matching: find new driver for the customer
        for (const ride of ridesToCancel) {
          const nearbyDrivers = await Driver.find({
            currentLocation: {
              $near: {
                $geometry: {
                  type: 'Point',
                  coordinates: ride.pickupLocation.coordinates
                },
                $maxDistance: 5000 // 5km
              }
            },
            isOnline: true,
            isAvailable: true,
            _id: { $ne: driver._id } // Exclude cancelled driver
          }).limit(5);

          if (nearbyDrivers.length > 0) {
            // Update ride status back to PENDING
            await RideRequest.findByIdAndUpdate(ride._id, {
              $set: {
                status: 'PENDING',
                acceptedDriverId: null,
                acceptedAt: null,
                otp: null,
                expiresAt: new Date(Date.now() + 5 * 60 * 1000) // Reset expiry
              }
            });

            // Notify new drivers
            const { estimateEtaMinutes } = require('../utils/geoHelper');
            for (const newDriver of nearbyDrivers) {
              emitToUser('driver', newDriver.userId.toString(), 'ride:new-request', {
                rideRequestId: ride._id,
                pickup: ride.pickupLocation,
                drop: ride.dropLocation,
                fareEstimate: ride.fare?.estimated,
                distanceKm: ride.fare?.details?.distanceKm,
                etaMinutes: estimateEtaMinutes(newDriver.currentLocation.coordinates, ride.pickupLocation.coordinates)
              });
            }
            emitToUser('customer', ride.customerId.toString(), 'ride:rematching', {
              rideRequestId: ride._id,
              message: `Finding a new driver... ${nearbyDrivers.length} drivers nearby`,
            });
          } else {
            // No drivers available, mark as expired
            await RideRequest.findByIdAndUpdate(rideRequest._id, {
              $set: { status: 'EXPIRED', ttlAt: new Date() }
            });
            emitToUser('customer', rideRequest.customerId.toString(), 'ride:expired', {
              rideRequestId: rideRequest._id,
              message: 'No drivers available. Please try again later.',
            });
          }
        }

        socket.emit('ride:cancel:ack', { success: true });
      } catch (err) {
        logger.error('ride:cancel error', { error: err.message });
        socket.emit('ride:cancel:error', { message: 'Failed to cancel ride' });
      }
    });

    socket.on('shuttle:listing', async (data) => {
      const userId = socket.userId;
      try {
        const v = validateShuttleListing(data);
        if (!v.valid) return reject(socket, 'shuttle:listing:error', v.error, 'Invalid location');
        const { latitude, longitude } = v.value;
        const { findNearbyRideRequests } = require('../services/shuttleMatchingService');

        const driver = await Driver.findOne({ userId }).select('_id vehicleCapacity currentLocation').lean();
        if (!driver) return;

        const existingShuttle = await shuttleService.getActiveShuttleForDriver(driver._id);
        const excludeIds = existingShuttle
          ? existingShuttle.rideRequestIds.map((id) => id.toString())
          : [];

        const rides = await findNearbyRideRequests(
          [longitude, latitude],
          { maxResults: 20, excludeRideRequestIds: excludeIds }
        );

        socket.emit('shuttle:listing:result', { rides });
      } catch (err) {
        logger.error('shuttle:listing error', { error: err.message });
        socket.emit('shuttle:listing:error', { message: 'Failed to fetch ride listings' });
      }
    });

    socket.on('shuttle:accept', async (data) => {
      const userId = socket.userId;
      return handleShuttleAccept(socket, io, userId, data);
      try {
        if (rateLimited(socket, 'shuttle:accept', rideActionLimiter, 'shuttle:accept:error', 'Too many requests')) return;
        const v = validateShuttleAccept(data);
        if (!v.valid) return reject(socket, 'shuttle:accept:error', v.error, 'Invalid payload');
        const { rideRequestIds } = v.value;

        const driver = await Driver.findOne({ userId }).select('_id vehicleCapacity currentLocation');
        if (!driver) {
          socket.emit('shuttle:accept:error', { message: 'Driver profile not found' });
          return;
        }

        const existingShuttle = await shuttleService.getActiveShuttleForDriver(driver._id);
        if (!driver.isAvailable && !existingShuttle) {
          socket.emit('shuttle:accept:error', { message: 'You are not available to accept rides' });
          return;
        }

        if (existingShuttle) {
          const remainingCapacity = (driver.vehicleCapacity || 6) - existingShuttle.rideRequestIds.length;
          if (rideRequestIds.length > remainingCapacity) {
            socket.emit('shuttle:accept:error', {
              message: `Only ${remainingCapacity} seat(s) remaining in this shuttle`,
            });
            return;
          }

          // BUG (fixed): this used to call addRideToShuttleSession with only
          // rideRequestIds[0]. The schema (shuttleAcceptSchema) allows up to
          // 6 ride ids per call, so any ids beyond the first were silently
          // never added to the shuttle (no shuttleSessionId, no sequence
          // entry) yet the code below still tried to notify their
          // customers — those customers simply never received
          // 'ride:accepted' and their ride sat PENDING forever. Add each
          // ride in the batch, one at a time (addRideToShuttleSession
          // mutates + saves the same Mongoose document, so this must be
          // sequential, not Promise.all).
          let shuttle = existingShuttle;
          const addedRideIds = [];
          const failedRides = [];
          for (const rideRequestId of rideRequestIds) {
            try {
              shuttle = await shuttleService.addRideToShuttleSession(
                shuttle._id,
                rideRequestId,
                driver.currentLocation
              );
              addedRideIds.push(rideRequestId);
            } catch (err) {
              logger.error('Failed to add ride to existing shuttle', { rideRequestId, error: err.message });
              failedRides.push({ rideRequestId, message: err.message });
            }
          }

          if (addedRideIds.length === 0) {
            socket.emit('shuttle:accept:error', {
              message: 'Failed to add any of the requested rides to the shuttle',
              failedRides,
            });
            return;
          }

          // Ensure every newly-added ride has an OTP before notifying its
          // customer. addRideToShuttleSession only threads the ride into
          // the shuttle sequence — it does not issue an OTP.
          for (const rideId of addedRideIds) {
            const r = await RideRequest.findById(rideId).select('otp').lean();
            if (r && !r.otp?.code) {
              await RideRequest.findByIdAndUpdate(rideId, {
                $set: {
                  otp: {
                    code: generateOtp(),
                    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
                    verified: false,
                  },
                },
              });
            }
          }

          const rides = await RideRequest.find({ _id: { $in: shuttle.rideRequestIds } })
            .select('_id customerId customerName pickupLocation dropLocation fare otp')
            .lean();

          // BUG (fixed): ridePairing.setPairing(driverId, customerId) was
          // previously called as
          // `ridePairing.setPairing(driver._id.toString(), rideRequestIds[0])`
          // — passing a RideRequest _id where a customer _id was expected.
          // That corrupted the driver<->customer pairing maps (used to
          // route driver:location:update events) with a bogus "customer"
          // id, and never paired the real customer at all. Pair using each
          // ride's actual customerId instead.
          for (const rideId of addedRideIds) {
            const ride = rides.find((r) => r._id.toString() === rideId);
            if (ride && ride.customerId) {
              await ridePairing.setPairing(driver._id.toString(), ride.customerId.toString());
            }
          }

          socket.emit('shuttle:ride-added', {
            shuttleSessionId: shuttle._id,
            shuttle,
            newRides: rides.filter((r) => addedRideIds.includes(r._id.toString())),
            navigationUrl: shuttle.navigationUrl,
            failedRides: failedRides.length > 0 ? failedRides : undefined,
          });

          for (const rideId of addedRideIds) {
            const ride = rides.find((r) => r._id.toString() === rideId);
            if (ride) {
              emitToUser('customer', ride.customerId.toString(), 'ride:accepted', {
                rideRequestId: ride._id,
                driver: {
                  id: driver._id,
                  name: driver.name,
                  vehicleNumber: driver.vehicleNumber,
                  vehicleModel: driver.vehicleModel,
                },
                otp: ride.otp?.code,
                pickup: ride.pickupLocation,
                drop: ride.dropLocation,
                isShuttle: true,
                shuttleSessionId: shuttle._id,
              });
            }
          }
          return;
        }

        const validRides = await RideRequest.find({
          _id: { $in: rideRequestIds },
          status: 'PENDING',
          isDeleted: false,
        }).lean();

        if (validRides.length === 0) {
          socket.emit('shuttle:accept:error', { message: 'No valid rides found' });
          return;
        }

        if (validRides.length > driver.vehicleCapacity) {
          socket.emit('shuttle:accept:error', {
            message: `Cannot accept ${validRides.length} rides — vehicle capacity is ${driver.vehicleCapacity}`,
          });
          return;
        }

        const locked = await Driver.findOneAndUpdate(
          { userId, isAvailable: true },
          { $set: { isAvailable: false } }
        );
        if (!locked) {
          socket.emit('shuttle:accept:error', { message: 'You already have an active ride' });
          return;
        }

        const shuttle = await shuttleService.createShuttleSession(
          driver._id,
          validRides.map((r) => r._id),
          driver.currentLocation
        );

        const fullDriver = await Driver.findById(driver._id).lean();

        // Generate each passenger's OTP before notifying them, so the
        // ride:accepted payload can include it. Doing this after
        // notification (as before) meant customers never received an OTP.
        const { generateOtp: genOtpEarly } = require('../utils/otpHelper');
        for (const ride of validRides) {
          if (!ride.otp?.code) {
            const code = genOtpEarly();
            await RideRequest.findByIdAndUpdate(ride._id, {
              $set: {
                otp: { code, expiresAt: new Date(Date.now() + 30 * 60 * 1000), verified: false },
              },
            });
            ride.otp = { code };
          }
        }

        for (const ride of validRides) {
          await ridePairing.setPairing(driver._id.toString(), ride.customerId.toString());

          emitToUser('customer', ride.customerId.toString(), 'ride:accepted', {
            rideRequestId: ride._id,
            driver: {
              id: driver._id,
              name: fullDriver.name,
              phone: fullDriver.userId?.phone,
              vehicleNumber: fullDriver.vehicleNumber,
              vehicleModel: fullDriver.vehicleModel,
              currentLocation: fullDriver.currentLocation,
            },
            otp: ride.otp?.code,
            pickup: ride.pickupLocation,
            drop: ride.dropLocation,
            isShuttle: true,
            shuttleSessionId: shuttle._id,
          });
        }

        const losingDriverIds = [];
        for (const ride of validRides) {
          const losing = ride.matchedDrivers
            .filter((d) => d.driverId && d.driverId.toString() !== driver._id.toString())
            .map((d) => d.driverId.toString());
          losingDriverIds.push(...losing);
        }
        const uniqueLosingDrivers = [...new Set(losingDriverIds)];
        if (uniqueLosingDrivers.length > 0) {
          const losingDrivers = await Driver.find({ _id: { $in: uniqueLosingDrivers } }).select('userId').lean();
          for (const ld of losingDrivers) {
            if (ld.userId) {
              for (const rideId of rideRequestIds) {
                emitToUser('driver', ld.userId.toString(), 'ride:unavailable', {
                  rideRequestId: rideId,
                  message: 'This ride has been accepted by another driver',
                });
              }
            }
          }
        }

        io.of('/sockets/admin').emit('shuttle:new', {
          shuttleSessionId: shuttle._id,
          driverId: driver._id,
          rideCount: validRides.length,
        });

        const rides = await RideRequest.find({ _id: { $in: shuttle.rideRequestIds } })
          .select('_id customerId customerName pickupLocation dropLocation fare otp')
          .lean();

        // Structured per-passenger list — each entry carries its own OTP,
        // pickup, and drop so the driver app can render distinct passenger
        // cards instead of reusing one ride's data for everyone.
        const passengers = rides.map((r) => ({
          rideRequestId: r._id,
          customerName: r.customerName,
          pickup: r.pickupLocation,
          drop: r.dropLocation,
          otp: r.otp?.code,
          fareEstimate: r.fare?.estimated,
        }));

        socket.emit('shuttle:accept:ack', {
          success: true,
          shuttleSessionId: shuttle._id,
          shuttle,
          rides,
          passengers,
          navigationUrl: shuttle.navigationUrl,
        });
      } catch (err) {
        logger.error('shuttle:accept error', { error: err.message });
        socket.emit('shuttle:accept:error', { message: 'Failed to accept rides' });
      }
    });

    socket.on('shuttle:pickup-verify', async (data) => {
      const userId = socket.userId;
      return handleShuttlePickupVerify(socket, io, userId, data);
      try {
        if (rateLimited(socket, 'shuttle:pickup-verify', otpVerifyLimiter, 'shuttle:pickup-verify:error', 'Too many OTP attempts')) return;
        const v = validateShuttlePickupVerify(data);
        if (!v.valid) return reject(socket, 'shuttle:pickup-verify:error', v.error, 'Invalid payload');

        const driver = await Driver.findOne({ userId }).select('_id');
        if (!driver) {
          socket.emit('shuttle:pickup-verify:error', { message: 'Driver profile not found' });
          return;
        }

        const { shuttleSessionId, rideRequestId, otp } = v.value;

        const rideBeforeLookup = await RideRequest.findById(rideRequestId).select('shuttleSessionId').lean();
        const ambiguousMatch = await shuttleService.getActiveShuttleForDriver(driver._id);
        console.log('[SHUTTLE_LOOKUP_TRACE] shuttle:pickup-verify', {
          rideRequestId,
          'ride.shuttleSessionId': rideBeforeLookup?.shuttleSessionId?.toString() || null,
          incomingShuttleSessionId: shuttleSessionId,
          driverId: driver._id.toString(),
          oldQuery: { driverId: driver._id.toString(), status: { $in: shuttleService.ACTIVE_SHUTTLE_STATUSES }, isDeleted: false },
          oldQueryResult: ambiguousMatch
            ? { _id: ambiguousMatch._id.toString(), status: ambiguousMatch.status, driverId: ambiguousMatch.driverId.toString(), rideRequestIds: ambiguousMatch.rideRequestIds.map((id) => id.toString()) }
            : null,
        });

        // Root-cause fix: resolve the shuttle by the _id the client sent
        // (scoped to this driver and to an active status), not by
        // {driverId, status} alone. The old query could resolve to a
        // *different* ShuttleSession than the one rideRequest.shuttleSessionId
        // actually pointed to whenever more than one row matched
        // {driverId, status}, since findOne has no sort/uniqueness
        // guarantee — producing a false "Shuttle session not found" even
        // though the referenced session existed exactly where the client
        // said it did.
        const shuttle = await shuttleService.getActiveShuttleById(shuttleSessionId, driver._id);
        console.log('[SHUTTLE_LOOKUP_TRACE] shuttle:pickup-verify (fixed query result)', {
          query: { _id: shuttleSessionId, driverId: driver._id.toString(), status: { $in: shuttleService.ACTIVE_SHUTTLE_STATUSES }, isDeleted: false },
          result: shuttle
            ? { _id: shuttle._id.toString(), status: shuttle.status, driverId: shuttle.driverId.toString(), rideRequestIds: shuttle.rideRequestIds.map((id) => id.toString()) }
            : null,
        });
        if (!shuttle) {
          socket.emit('shuttle:pickup-verify:error', { message: 'Shuttle session not found' });
          return;
        }

        const ride = await RideRequest.findOne({
          _id: rideRequestId,
          shuttleSessionId,
          status: { $in: ['ACCEPTED', 'DRIVER_ARRIVING', 'IN_PROGRESS'] },
        });

        if (!ride) {
          socket.emit('shuttle:pickup-verify:error', { message: 'Ride not found in this shuttle' });
          return;
        }

        const verificationResult = ride.otp?.code === otp
          && (!ride.otp?.expiresAt || new Date() < ride.otp.expiresAt);

        console.log('[EXECUTION_TRACE] shuttle:pickup-verify', {
          shuttleSessionId,
          rideRequestId,
          storedOtp: ride.otp?.code || 'N/A',
          otpEntered: otp,
          otpComparisonResult: verificationResult ? 'Match' : 'Mismatch',
          rideRequestStatusBefore: ride.status,
          rideRequestStatusAfter: verificationResult ? 'IN_PROGRESS' : ride.status,
          shuttleSessionStatusBefore: shuttle.status,
        });

        if (ride.otp?.code !== otp) {
          logger.info('[OTP_VERIFY]', { shuttleSessionId, rideRequestId, otpEntered: otp, storedOtp: ride.otp?.code, verificationResult: 'Invalid OTP' });
          socket.emit('shuttle:pickup-verify:error', { message: 'Invalid OTP' });
          return;
        }

        if (ride.otp?.expiresAt && new Date() > ride.otp.expiresAt) {
          logger.info('[OTP_VERIFY]', { shuttleSessionId, rideRequestId, verificationResult: 'Expired' });
          socket.emit('shuttle:pickup-verify:error', { message: 'OTP has expired' });
          return;
        }

        const result = await shuttleService.verifyPickupOtp(shuttleSessionId, rideRequestId, otp);
        const updatedShuttle = result.shuttle;

        logger.info('[OTP_VERIFY]', { shuttleSessionId, rideRequestId, verificationResult: 'Success' });
        logger.info('[BUNDLE_DEBUG] OTP Verified', { RideId: rideRequestId });

        emitToUser('customer', ride.customerId.toString(), 'ride:started', {
          rideRequestId: ride._id,
          message: 'You have been picked up! Ride in progress.',
        });

        io.of('/sockets/admin').emit('ride:update', {
          rideRequestId: ride._id,
          status: 'IN_PROGRESS',
        });

        const { estimateEtaMinutes, haversineKm: haversine } = require('../utils/geoHelper');
        const driverLocation = await Driver.findById(driver._id).select('currentLocation').lean();
        const driverCoords = driverLocation?.currentLocation?.coordinates;
        const dropCoords = ride.dropLocation.coordinates;
        const dropEtaMinutes = driverCoords ? estimateEtaMinutes(driverCoords, dropCoords) : null;

        const nextPickup = updatedShuttle.sequence.find(
          (s) => s.type === 'PICKUP' && s.status === 'PENDING' && s.rideRequestId.toString() !== rideRequestId
        );

        socket.emit('shuttle:pickup-verify:ack', {
          success: true,
          rideRequestId,
          dropEtaMinutes,
          nextPickup: nextPickup || null,
        });
      } catch (err) {
        logger.error('shuttle:pickup-verify error', { error: err.message });
        socket.emit('shuttle:pickup-verify:error', { message: 'Failed to verify OTP' });
      }
    });

    socket.on('shuttle:complete-drop', async (data) => {
      const userId = socket.userId;
      return handleShuttleCompleteDrop(socket, io, userId, data);
      try {
        if (rateLimited(socket, 'shuttle:complete-drop', rideActionLimiter, 'shuttle:complete-drop:error', 'Too many requests')) return;
        const v = validateShuttleCompleteDrop(data);
        if (!v.valid) return reject(socket, 'shuttle:complete-drop:error', v.error, 'Invalid payload');
        const { shuttleSessionId, rideRequestId } = v.value;

        const driver = await Driver.findOne({ userId }).select('_id');
        if (!driver) {
          socket.emit('shuttle:complete-drop:error', { message: 'Driver profile not found' });
          return;
        }

        const shuttle = await shuttleService.getActiveShuttleById(shuttleSessionId, driver._id);
        if (!shuttle) {
          socket.emit('shuttle:complete-drop:error', { message: 'Shuttle session not found' });
          return;
        }

        const ride = await RideRequest.findOne({
          _id: rideRequestId,
          shuttleSessionId,
          status: 'IN_PROGRESS',
        });

        if (!ride) {
          socket.emit('shuttle:complete-drop:error', { message: 'Ride not in progress or not in this shuttle' });
          return;
        }

        const rideDurationMs = Date.now() - (ride.pickupAt?.getTime() || Date.now());
        const rideDurationMin = Math.round(rideDurationMs / 60000);
        const estimatedDistance = ride.fare?.details?.distanceKm || 0;
        const finalFare = calculateFinalFare(
          estimatedDistance,
          rideDurationMin,
          ride.fare,
          new Date()
        );

        await RideRequest.findByIdAndUpdate(rideRequestId, {
          $set: {
            status: 'COMPLETED',
            completedAt: new Date(),
            ttlAt: new Date(),
            'fare.final': finalFare,
          },
        });

        const result = await shuttleService.completeDrop(shuttleSessionId, rideRequestId);
        const updatedShuttle = result.shuttle;

        ridePairing.clearPairing(driver._id.toString(), ride.customerId?.toString());

        emitToUser('customer', ride.customerId.toString(), 'ride:completed', {
          rideRequestId: ride._id,
          message: 'You have reached your destination!',
          durationMinutes: rideDurationMin,
          fare: {
            final: finalFare,
            estimated: ride.fare?.estimated,
            breakdown: ride.fare?.breakdown,
            details: ride.fare?.details,
          },
        });

        io.of('/sockets/admin').emit('ride:update', {
          rideRequestId: ride._id,
          status: 'COMPLETED',
        });

        const { estimateEtaMinutes } = require('../utils/geoHelper');
        const driverLocation = await Driver.findById(driver._id).select('currentLocation').lean();
        const driverCoords = driverLocation?.currentLocation?.coordinates;

        const nextPickup = updatedShuttle.sequence.find(
          (s) => s.type === 'PICKUP' && s.status === 'PENDING'
        );
        const nextDrop = updatedShuttle.sequence.find(
          (s) => s.type === 'DROP' && s.status === 'PENDING'
        );

        if (result.allDropsCompleted) {
          await Driver.findOneAndUpdate({ userId }, { isAvailable: true });
          socket.emit('shuttle:complete:ack', { success: true, allDropsCompleted: true });
        } else {
          socket.emit('shuttle:complete-drop:ack', {
            success: true,
            rideRequestId,
            allDropsCompleted: false,
            nextPickup: nextPickup || null,
            nextDrop: nextDrop || null,
            updatedNavUrl: shuttleService.buildShuttleNavUrlFromSession(updatedShuttle),
          });
        }
      } catch (err) {
        logger.error('shuttle:complete-drop error', { error: err.message });
        socket.emit('shuttle:complete-drop:error', { message: 'Failed to complete drop' });
      }
    });

    socket.on('shuttle:navigate', async (data) => {
      const userId = socket.userId;
      try {
        const v = validateShuttleNavigate(data);
        if (!v.valid) return reject(socket, 'shuttle:navigate:error', v.error, 'Invalid payload');
        const { shuttleSessionId } = v.value;

        const driver = await Driver.findOne({ userId }).select('_id');
        if (!driver) return;

        const shuttle = await shuttleService.getActiveShuttleForDriver(driver._id);
        if (!shuttle || shuttle._id.toString() !== shuttleSessionId) {
          socket.emit('shuttle:navigate:error', { message: 'Shuttle session not found' });
          return;
        }

        const navUrl = shuttleService.buildShuttleNavUrlFromSession(shuttle);
        socket.emit('shuttle:navigation-url', { url: navUrl, shuttle });
      } catch (err) {
        logger.error('shuttle:navigate error', { error: err.message });
        socket.emit('shuttle:navigate:error', { message: 'Failed to get navigation URL' });
      }
    });

    socket.on('shuttle:cancel', async (data) => {
      const userId = socket.userId;
      try {
        if (rateLimited(socket, 'shuttle:cancel', rideActionLimiter, 'shuttle:cancel:error', 'Too many requests')) return;
        const v = validateShuttleCancel(data);
        if (!v.valid) return reject(socket, 'shuttle:cancel:error', v.error, 'Invalid payload');
        const { shuttleSessionId, reason } = v.value;

        const driver = await Driver.findOne({ userId }).select('_id');
        if (!driver) return;

        const shuttle = await shuttleService.getActiveShuttleForDriver(driver._id);
        if (!shuttle || shuttle._id.toString() !== shuttleSessionId) {
          socket.emit('shuttle:cancel:error', { message: 'Shuttle session not found' });
          return;
        }

        const rideIds = shuttle.rideRequestIds.map((id) => id.toString());

        await shuttleService.cancelShuttleSession(shuttleSessionId);

        for (const rideId of rideIds) {
          ridePairing.clearPairing(driver._id.toString(), rideId);
        }

        await Driver.findOneAndUpdate({ userId }, { isAvailable: true });

        socket.emit('shuttle:cancel:ack', { success: true });

        io.of('/sockets/admin').emit('shuttle:cancelled', {
          shuttleSessionId,
          driverId: driver._id,
        });
      } catch (err) {
        logger.error('shuttle:cancel error', { error: err.message });
        socket.emit('shuttle:cancel:error', { message: 'Failed to cancel shuttle' });
      }
    });

    socket.on('shuttle:complete', async (data) => {
      const userId = socket.userId;
      try {
        const v = validateShuttleNavigate(data);
        if (!v.valid) return reject(socket, 'shuttle:complete:error', v.error, 'Invalid payload');
        const { shuttleSessionId } = v.value;

        const driver = await Driver.findOne({ userId }).select('_id');
        if (!driver) return;

        const shuttle = await shuttleService.getActiveShuttleForDriver(driver._id);
        if (!shuttle || shuttle._id.toString() !== shuttleSessionId) {
          socket.emit('shuttle:complete:error', { message: 'Shuttle session not found' });
          return;
        }

        await shuttleService.completeShuttleSession(shuttleSessionId);

        for (const rideId of shuttle.rideRequestIds) {
          ridePairing.clearPairing(driver._id.toString(), rideId.toString());
        }

        await Driver.findOneAndUpdate({ userId }, { isAvailable: true });

        socket.emit('shuttle:complete:ack', { success: true });
      } catch (err) {
        logger.error('shuttle:complete error', { error: err.message });
        socket.emit('shuttle:complete:error', { message: 'Failed to complete shuttle' });
      }
    });
  });
}

module.exports = { registerDriverEvents };