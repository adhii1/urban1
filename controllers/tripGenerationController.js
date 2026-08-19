const asyncWrapper = require('../middleware/asyncWrapper');
const formatResponse = require('../utils/responseFormatter');
const { ValidationError } = require('../utils/AppError');
const { generateForServiceDate, normalizeServiceDate } = require('../services/tripGenerator');

const MAX_RECOVERY_DAYS = 31;

function parseRecoveryDate(value, field) {
  try {
    return normalizeServiceDate(value);
  } catch (error) {
    throw new ValidationError(`${field} must be a valid local service date.`, { code: error.code });
  }
}

const generateRecoveryTrips = asyncWrapper(async (req, res) => {
  const { startDate, endDate = startDate, routeIds } = req.body || {};
  if (!startDate) {
    throw new ValidationError('startDate is required.', { code: 'RECOVERY_START_DATE_REQUIRED' });
  }

  const start = parseRecoveryDate(startDate, 'startDate');
  const end = parseRecoveryDate(endDate, 'endDate');
  const dayCount = Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
  if (dayCount < 1 || dayCount > MAX_RECOVERY_DAYS) {
    throw new ValidationError(`Recovery range must contain between 1 and ${MAX_RECOVERY_DAYS} service dates.`, {
      code: 'RECOVERY_RANGE_INVALID',
    });
  }
  if (routeIds !== undefined && (!Array.isArray(routeIds) || routeIds.length > 100)) {
    throw new ValidationError('routeIds must be an array of no more than 100 route identifiers.', {
      code: 'RECOVERY_ROUTE_FILTER_INVALID',
    });
  }

  const results = [];
  for (let serviceDate = new Date(start); serviceDate <= end; serviceDate.setDate(serviceDate.getDate() + 1)) {
    results.push(await generateForServiceDate(new Date(serviceDate), { routeIds }));
  }

  return res.status(200).json(formatResponse('Trip generation recovery completed.', results, {
    startDate: start,
    endDate: end,
    processedDates: results.length,
  }));
});

module.exports = { MAX_RECOVERY_DAYS, generateRecoveryTrips };
