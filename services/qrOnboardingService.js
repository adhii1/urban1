/**
 * qrOnboardingService — QR-based shuttle onboarding.
 *
 * Flow:
 *   1. Customer's app requests a boarding QR for their upcoming trip.
 *      We return a short-lived signed token (JWT) encoding { tripId, customerId }.
 *      The customer app renders that token string as a QR code.
 *   2. When the shuttle arrives, the driver scans the QR. The scanned token is
 *      POSTed to the driver scan endpoint. We verify the signature, confirm the
 *      passenger belongs to this driver's trip, and mark them BOARDED.
 *
 * The token is signed, so it can't be forged, and expires so a screenshot can't
 * be reused days later. This complements (does not replace) the OTP flow.
 */

const jwt = require('jsonwebtoken');
const config = require('../config/config');
const Trip = require('../models/Trip');
const Customer = require('../models/Customer');
const Driver = require('../models/Driver');
const { emitToUser } = require('../config/socket');
const logger = require('../utils/logger');

const QR_TTL_SECONDS = 60 * 60 * 12; // valid for the service day (12h)

/**
 * Build a signed boarding token for a customer + trip. Encoded as a JWT so the
 * driver's scan can be verified offline-of-DB (signature) then confirmed in DB.
 */
function signBoardingToken({ tripId, customerId, subscriptionId }) {
  return jwt.sign(
    { t: 'BOARDING', tripId: String(tripId), customerId: String(customerId), subscriptionId: subscriptionId ? String(subscriptionId) : undefined },
    config.jwt.secret,
    { expiresIn: QR_TTL_SECONDS }
  );
}

function verifyBoardingToken(token) {
  const decoded = jwt.verify(token, config.jwt.secret);
  if (decoded.t !== 'BOARDING') throw new Error('Not a boarding token');
  return decoded;
}

/**
 * Get (or lazily create) the boarding QR payload for the authenticated
 * customer's next active trip. Returns the token string the app renders as QR.
 */
async function getBoardingQrForCustomer(userId) {
  const customer = await Customer.findOne({ userId }).select('_id name').lean();
  if (!customer) return { success: false, reason: 'Customer profile not found' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find the customer's next non-completed trip (as a pooled passenger).
  const trip = await Trip.findOne({
    'passengers.customerId': customer._id,
    serviceDate: { $gte: today },
    status: { $in: ['SCHEDULED', 'ACCEPTED', 'IN_PROGRESS'] },
    isDeleted: false,
  })
    .sort({ serviceDate: 1 })
    .lean();

  if (!trip) return { success: false, reason: 'No upcoming trip to board' };

  const passenger = (trip.passengers || []).find(
    (p) => p.customerId?.toString() === customer._id.toString()
  );
  if (!passenger) return { success: false, reason: 'You are not on this trip' };

  const token = signBoardingToken({
    tripId: trip._id,
    customerId: customer._id,
    subscriptionId: passenger.subscriptionId,
  });

  return {
    success: true,
    token,
    trip: {
      tripId: trip._id,
      serviceDate: trip.serviceDate,
      pickupTime: trip.pickupTime,
      status: trip.status,
      boardingStatus: passenger.status,
      boarded: ['RIDE_STARTED', 'DROPPING_OFF', 'COMPLETED'].includes(passenger.status),
    },
    customerName: customer.name,
  };
}

/**
 * Driver scans a customer's QR. Verifies the token, confirms the passenger is
 * on THIS driver's trip, and boards them (idempotent). Returns passenger info
 * for the driver's confirmation screen.
 */
async function boardByScan(driverUserId, token) {
  if (!token) return { success: false, reason: 'No QR token provided' };

  let decoded;
  try {
    decoded = verifyBoardingToken(token);
  } catch (err) {
    return { success: false, reason: err.name === 'TokenExpiredError' ? 'QR code expired. Ask the passenger to refresh it.' : 'Invalid QR code' };
  }

  const driver = await Driver.findOne({ userId: driverUserId }).select('_id name').lean();
  if (!driver) return { success: false, reason: 'Driver profile not found' };

  const trip = await Trip.findOne({ _id: decoded.tripId, isDeleted: false });
  if (!trip) return { success: false, reason: 'Trip not found' };

  // The QR must belong to a trip this driver is actually running.
  if (!trip.driverId || trip.driverId.toString() !== driver._id.toString()) {
    return { success: false, reason: 'This passenger is not on your trip' };
  }

  const passenger = (trip.passengers || []).find(
    (p) => p.customerId?.toString() === decoded.customerId
  );
  if (!passenger) return { success: false, reason: 'Passenger not found on this trip' };

  const alreadyBoarded = ['RIDE_STARTED', 'DROPPING_OFF', 'COMPLETED'].includes(passenger.status);

  if (!alreadyBoarded) {
    passenger.status = 'RIDE_STARTED';
    passenger.otp.verified = true; // QR scan is an accepted verification path
    passenger.boardedAt = new Date();
    if (trip.status === 'ACCEPTED' || trip.status === 'SCHEDULED') {
      trip.status = 'IN_PROGRESS';
      if (!trip.startedAt) trip.startedAt = new Date();
    }
    await trip.save();

    // Notify the customer their boarding was confirmed.
    const customer = await Customer.findById(decoded.customerId).select('userId').lean();
    if (customer?.userId) {
      emitToUser('customer', customer.userId.toString(), 'ride:boarded', {
        tripId: trip._id.toString(),
        message: 'Boarding confirmed. Enjoy your ride!',
        method: 'QR',
      });
    }
    logger.info('[QrOnboarding] Passenger boarded via QR', { tripId: trip._id, customerId: decoded.customerId, driverId: driver._id });
  }

  // Load passenger name for the driver's confirmation UI.
  const custDoc = await Customer.findById(decoded.customerId).select('name').lean();

  return {
    success: true,
    alreadyBoarded,
    passenger: {
      name: custDoc?.name || 'Passenger',
      status: passenger.status,
      pickup: passenger.pickupLocation?.address,
      drop: passenger.dropLocation?.address,
    },
    trip: {
      tripId: trip._id.toString(),
      boardedCount: (trip.passengers || []).filter((p) => ['RIDE_STARTED', 'DROPPING_OFF', 'COMPLETED'].includes(p.status)).length,
      totalCount: (trip.passengers || []).length,
    },
  };
}

module.exports = {
  signBoardingToken,
  verifyBoardingToken,
  getBoardingQrForCustomer,
  boardByScan,
  QR_TTL_SECONDS,
};
