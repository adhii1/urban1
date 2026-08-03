const rateLimit = require('express-rate-limit');
const formatError = require('../utils/errorFormatter');
const config = require('../config/config');

const isDev = config.env === 'development';

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 5000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: formatError('Too many requests. Please try again after 15 minutes.'),
  statusCode: 429,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 5000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: formatError('Too many authentication attempts. Please try again after 15 minutes.'),
  statusCode: 429,
  skipSuccessfulRequests: true,
});

const otpLimiter = rateLimit({
  windowMs: isDev ? 60 * 1000 : 60 * 60 * 1000,
  max: isDev ? 100 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: formatError('Too many OTP requests. Please try again later.'),
  statusCode: 429,
});

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: formatError('Too many booking requests. Please try again after 15 minutes.'),
  statusCode: 429,
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: formatError('Too many password reset attempts. Please try again after 1 hour.'),
  statusCode: 429,
});

module.exports = { generalLimiter, authLimiter, otpLimiter, bookingLimiter, passwordResetLimiter };
