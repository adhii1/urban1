const formatError = require('../utils/errorFormatter');
const notFound = (req, res, next) => {
  res.status(404).json(formatError(`Route not found: ${req.originalUrl}`));
};
module.exports = notFound;
