const RideRequest = require('../models/RideRequest');
const Driver = require('../models/Driver');
const { emitToUser } = require('../config/socket');
const ridePairing = require('../services/ridePairingService');
const logger = require('../utils/logger');

class RideExpiryService {
  constructor() {
    this.intervalHandle = null;
    this.checkIntervalMs = 30000; // Check every 30 seconds
  }

  start() {
    if (this.intervalHandle) {
      logger.warn('RideExpiryService already running');
      return;
    }

    logger.info('Starting RideExpiryService');
    this.intervalHandle = setInterval(() => {
      this.expirePendingRides().catch((err) => {
        logger.error('RideExpiryService error', { error: err.message });
      });
    }, this.checkIntervalMs);

    if (this.intervalHandle.unref) {
      this.intervalHandle.unref();
    }
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      logger.info('RideExpiryService stopped');
    }
  }

  async expirePendingRides() {
    const now = new Date();

    // Find all PENDING rides that have expired
    const expiredRides = await RideRequest.find({
      status: 'PENDING',
      expiresAt: { $lte: now },
      isDeleted: false,
    }).select('_id customerId matchedDrivers acceptedDriverId');

    if (expiredRides.length === 0) {
      return;
    }

    logger.info(`Found ${expiredRides.length} expired pending rides`);

    for (const ride of expiredRides) {
      await this.expireRide(ride);
    }
  }

  async expireRide(ride) {
    try {
      // Update ride status to EXPIRED
      await RideRequest.findByIdAndUpdate(ride._id, {
        $set: {
          status: 'EXPIRED',
          ttlAt: new Date(),
        },
      });

      // Notify customer
      emitToUser('customer', ride.customerId.toString(), 'ride:expired', {
        rideRequestId: ride._id,
        message: 'No drivers available. Please try again.',
      });

      // Clear any driver pairings
      if (ride.acceptedDriverId) {
        await Driver.findByIdAndUpdate(ride.acceptedDriverId, {
          isAvailable: true,
        });
        ridePairing.clearPairing(
          ride.acceptedDriverId.toString(),
          ride.customerId.toString()
        );
      }

      logger.info(`Expired ride ${ride._id}`);
    } catch (err) {
      logger.error(`Failed to expire ride ${ride._id}`, { error: err.message });
    }
  }
}

module.exports = new RideExpiryService();
