const RideRequest = require('../models/RideRequest');
const Rating = require('../models/Rating');
const Driver = require('../models/Driver');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { NotFoundError, ValidationError } = require('../utils/AppError');
const { emitToUser } = require('../config/socket');

/**
 * Customer rates a completed ride
 * POST /api/v1/customer/rides/:rideId/rate
 */
const rateRide = asyncWrapper(async (req, res) => {
  const customerId = req.user.id;
  const { rideId } = req.params;
  const { rating, comment } = req.body;

  // Validate rating value
  if (!rating || rating < 1 || rating > 5) {
    throw new ValidationError('Rating must be between 1 and 5');
  }

  // Find the completed ride
  const ride = await RideRequest.findOne({
    _id: rideId,
    customerId: customerId,
    status: 'COMPLETED',
    isDeleted: false,
  });

  if (!ride) {
    throw new NotFoundError('Completed ride');
  }

  if (!ride.acceptedDriverId) {
    throw new ValidationError('Ride has no driver to rate');
  }

  // Check if already rated
  const existingRating = await Rating.findOne({
    rideId: rideId,
    customerId: customerId,
    isDeleted: false,
  });

  if (existingRating) {
    throw new ValidationError('You have already rated this ride');
  }

  // Create the rating
  const newRating = await Rating.create({
    rideId: rideId,
    customerId: customerId,
    driverId: ride.acceptedDriverId,
    rating: rating,
    comment: comment || '',
  });

  // Calculate driver's new average rating
  const driverStats = await Rating.calculateAverageRating(ride.acceptedDriverId);

  // Update driver's rating in Driver model (denormalized for quick access)
  await Driver.findByIdAndUpdate(ride.acceptedDriverId, {
    averageRating: driverStats.average,
    totalRatings: driverStats.count,
  });

  // Notify driver about the rating
  const driver = await Driver.findById(ride.acceptedDriverId).populate('userId', 'phone');
  if (driver && driver.userId) {
    emitToUser('driver', driver.userId._id.toString(), 'rating:received', {
      rideId: rideId,
      rating: rating,
      newAverage: driverStats.average,
      totalRatings: driverStats.count,
      message: `You received a ${rating}-star rating!`,
    });
  }

  return res.status(201).json(
    formatResponse('Rating submitted successfully', {
      rating: newRating.rating,
      comment: newRating.comment,
      driverAverageRating: driverStats.average,
      driverTotalRatings: driverStats.count,
    })
  );
});

/**
 * Get driver's rating summary
 * GET /api/v1/driver/ratings/summary
 */
const getDriverRatingSummary = asyncWrapper(async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) {
    throw new NotFoundError('Driver');
  }

  const stats = await Rating.calculateAverageRating(driver._id);

  // Get recent ratings (last 10)
  const recentRatings = await Rating.find({ driverId: driver._id, isDeleted: false })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('customerId', 'name')
    .populate('rideId', 'pickupLocation dropLocation createdAt')
    .lean();

  return res.status(200).json(
    formatResponse('Rating summary retrieved', {
      averageRating: stats.average,
      totalRatings: stats.count,
      recentRatings: recentRatings.map((r) => ({
        id: r._id,
        rating: r.rating,
        comment: r.comment,
        customerName: r.customerId?.name || 'Anonymous',
        rideDate: r.rideId?.createdAt,
        createdAt: r.createdAt,
      })),
    })
  );
});

/**
 * Get driver's detailed ratings with pagination
 * GET /api/v1/driver/ratings
 */
const getDriverRatings = asyncWrapper(async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) {
    throw new NotFoundError('Driver');
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const [ratings, total] = await Promise.all([
    Rating.find({ driverId: driver._id, isDeleted: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('customerId', 'name phone')
      .populate('rideId', 'pickupLocation dropLocation fare')
      .lean(),
    Rating.countDocuments({ driverId: driver._id, isDeleted: false }),
  ]);

  return res.status(200).json(
    formatResponse('Driver ratings retrieved', {
      ratings: ratings.map((r) => ({
        id: r._id,
        rating: r.rating,
        comment: r.comment,
        customerName: r.customerId?.name || 'Anonymous',
        customerPhone: r.customerId?.phone,
        pickupLocation: r.rideId?.pickupLocation,
        dropLocation: r.rideId?.dropLocation,
        fare: r.rideId?.fare,
        createdAt: r.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  );
});

/**
 * Get customer's rating history
 * GET /api/v1/customer/ratings
 */
const getCustomerRatings = asyncWrapper(async (req, res) => {
  const customerId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const [ratings, total] = await Promise.all([
    Rating.find({ customerId: customerId, isDeleted: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('driverId', 'name vehicleNumber vehicleModel')
      .populate('rideId', 'pickupLocation dropLocation fare createdAt')
      .lean(),
    Rating.countDocuments({ customerId: customerId, isDeleted: false }),
  ]);

  return res.status(200).json(
    formatResponse('Customer ratings retrieved', {
      ratings: ratings.map((r) => ({
        id: r._id,
        rating: r.rating,
        comment: r.comment,
        driverName: r.driverId?.name,
        driverVehicle: r.driverId
          ? `${r.driverId.vehicleModel} (${r.driverId.vehicleNumber})`
          : null,
        pickupLocation: r.rideId?.pickupLocation,
        dropLocation: r.rideId?.dropLocation,
        fare: r.rideId?.fare,
        rideDate: r.rideId?.createdAt,
        createdAt: r.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  );
});

module.exports = {
  rateRide,
  getDriverRatingSummary,
  getDriverRatings,
  getCustomerRatings,
};
