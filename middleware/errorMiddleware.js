const logger = require('../utils/logger');
const formatError = require('../utils/errorFormatter');

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let details = err.details || null;

  if (err.name === 'ValidationError' && err.errors) {
    statusCode = 400;
    message = 'Validation failed';
    details = Object.keys(err.errors).reduce((acc, key) => {
      acc[key] = err.errors[key].message;
      return acc;
    }, {});
  }
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `${field} already exists`;
  }
  if (err.name === 'JsonWebTokenError') { statusCode = 401; message = 'Invalid token'; }
  if (err.name === 'TokenExpiredError') { statusCode = 401; message = 'Token expired'; }

  const logMessage = `${statusCode} - ${message} - ${req.originalUrl} - ${req.method} - ${req.ip}`;
  if (statusCode >= 500) {
    logger.error(logMessage);
    if (err.stack) logger.debug(err.stack);
  } else {
    logger.warn(logMessage);
  }

  const response = formatError(message, details);
  if (process.env.NODE_ENV === 'development' && statusCode >= 500 && err.stack) {
    response.stack = err.stack;
  }
  res.status(statusCode).json(response);
};

module.exports = errorHandler;
