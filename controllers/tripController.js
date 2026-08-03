const Trip = require('../models/Trip');
const formatResponse = require('../utils/responseFormatter');
const asyncWrapper = require('../middleware/asyncWrapper');
const { NotFoundError } = require('../utils/AppError');

const getTrips = asyncWrapper(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [trips, total] = await Promise.all([
    Trip.find()
      .populate('routeId', 'name')
      .populate('driverId', 'name')
      .populate('manifest.customer', 'name')
      .sort({ tripDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Trip.countDocuments(),
  ]);

  return res.status(200).json(
    formatResponse('Trips retrieved.', trips, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }),
  );
});

const getTripById = asyncWrapper(async (req, res) => {
  const trip = await Trip.findById(req.params.id)
    .populate('routeId')
    .populate('driverId', 'name vehicleNumber')
    .populate('manifest.customer', 'name pickupLocation dropLocation');
  if (!trip) throw new NotFoundError('Trip');
  return res.status(200).json(formatResponse('Trip retrieved.', trip));
});

module.exports = { getTrips, getTripById };
