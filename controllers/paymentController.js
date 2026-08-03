const RideRequest = require('../models/RideRequest');
const paymentService = require('../services/paymentService');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { NotFoundError, ValidationError } = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Create payment order for a completed ride
 * POST /api/v1/customer/payments/create-order
 */
const createPaymentOrder = asyncWrapper(async (req, res) => {
  const { rideId } = req.body;
  const customerId = req.user.id;

  // Find the completed ride
  const ride = await RideRequest.findOne({
    _id: rideId,
    customerId,
    status: 'COMPLETED',
    isDeleted: false,
  });

  if (!ride) {
    throw new NotFoundError('Completed ride');
  }

  const amount = ride.fare?.final || ride.fare?.estimated;
  if (!amount) {
    throw new ValidationError('Ride has no fare amount');
  }

  // Convert to paise (Razorpay expects amount in smallest currency unit)
  const amountInPaise = Math.round(amount * 100);

  // Create payment order
  const order = await paymentService.createOrder({
    amount: amountInPaise,
    currency: 'INR',
    receipt: `ride_${ride._id}`,
    notes: {
      rideId: ride._id.toString(),
      customerId: customerId.toString(),
      pickup: ride.pickupLocation?.address,
      drop: ride.dropLocation?.address,
    },
  });

  // Store payment order ID on the ride
  await RideRequest.findByIdAndUpdate(ride._id, {
    $set: {
      'payment.orderId': order.orderId,
      'payment.status': 'pending',
      'payment.amount': amount,
    },
  });

  return res.status(200).json(
    formatResponse('Payment order created', {
      orderId: order.orderId,
      amount: amountInPaise,
      currency: order.currency || 'INR',
      rideId: ride._id,
      fare: amount,
    })
  );
});

/**
 * Verify payment after successful transaction
 * POST /api/v1/customer/payments/verify
 */
const verifyPayment = asyncWrapper(async (req, res) => {
  const { orderId, paymentId, signature, rideId } = req.body;
  const customerId = req.user.id;

  // Find the ride
  const ride = await RideRequest.findOne({
    _id: rideId,
    customerId,
    isDeleted: false,
  });

  if (!ride) {
    throw new NotFoundError('Ride');
  }

  // Verify payment signature
  const verification = await paymentService.verifyPayment({
    orderId,
    paymentId,
    signature,
  });

  if (!verification.verified) {
    // Mark payment as failed
    await RideRequest.findByIdAndUpdate(ride._id, {
      $set: {
        'payment.status': 'failed',
        'payment.paymentId': paymentId,
        'payment.verifiedAt': new Date(),
      },
    });

    return res.status(400).json(
      formatResponse('Payment verification failed', {
        verified: false,
      })
    );
  }

  // Mark payment as successful
  await RideRequest.findByIdAndUpdate(ride._id, {
    $set: {
      'payment.status': 'completed',
      'payment.paymentId': paymentId,
      'payment.verifiedAt': new Date(),
      'payment.orderId': orderId,
    },
  });

  logger.info(`Payment verified for ride ${ride._id}`, {
    paymentId,
    orderId,
  });

  return res.status(200).json(
    formatResponse('Payment verified successfully', {
      verified: true,
      paymentId,
      rideId: ride._id,
    })
  );
});

/**
 * Process refund for a cancelled ride
 * POST /api/v1/customer/payments/refund
 */
const processRefund = asyncWrapper(async (req, res) => {
  const { rideId, reason } = req.body;
  const customerId = req.user.id;

  // Find the ride with completed payment
  const ride = await RideRequest.findOne({
    _id: rideId,
    customerId,
    status: { $in: ['CANCELLED', 'COMPLETED'] },
    'payment.status': 'completed',
    isDeleted: false,
  });

  if (!ride) {
    throw new NotFoundError('Ride with completed payment');
  }

  if (ride.payment.refundId) {
    throw new ValidationError('Refund already processed for this ride');
  }

  const refundAmount = ride.fare?.final || ride.fare?.estimated;
  if (!refundAmount) {
    throw new ValidationError('Ride has no refund amount');
  }

  // Process refund (convert to paise)
  const refund = await paymentService.processRefund({
    paymentId: ride.payment.paymentId,
    amount: Math.round(refundAmount * 100),
  });

  // Update ride with refund details
  await RideRequest.findByIdAndUpdate(ride._id, {
    $set: {
      'payment.refundId': refund.refundId,
      'payment.refundStatus': refund.status,
      'payment.refundAmount': refundAmount,
      'payment.refundReason': reason || 'Customer requested',
      'payment.refundedAt': new Date(),
    },
  });

  logger.info(`Refund processed for ride ${ride._id}`, {
    refundId: refund.refundId,
    amount: refundAmount,
  });

  return res.status(200).json(
    formatResponse('Refund processed successfully', {
      refundId: refund.refundId,
      amount: refundAmount,
      status: refund.status,
    })
  );
});

/**
 * Get payment status for a ride
 * GET /api/v1/customer/payments/:rideId/status
 */
const getPaymentStatus = asyncWrapper(async (req, res) => {
  const { rideId } = req.params;
  const customerId = req.user.id;

  const ride = await RideRequest.findOne({
    _id: rideId,
    customerId,
    isDeleted: false,
  }).select('fare payment');

  if (!ride) {
    throw new NotFoundError('Ride');
  }

  return res.status(200).json(
    formatResponse('Payment status retrieved', {
      rideId: ride._id,
      fare: ride.fare,
      payment: ride.payment || { status: 'not_initiated' },
    })
  );
});

module.exports = {
  createPaymentOrder,
  verifyPayment,
  processRefund,
  getPaymentStatus,
};
