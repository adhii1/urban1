const logger = require('../utils/logger');

function reject(socket, event, error, message) {
  logger.warn(`Validation failed for ${event}`, { error, message });
  socket.emit(event, { message: error || message });
}

function rateLimited(socket, event, limiter, errorEvent, errorMessage) {
  if (!limiter(socket, event)) {
    socket.emit(errorEvent, { message: errorMessage || 'Rate limit exceeded' });
    return true;
  }
  return false;
}

module.exports = { reject, rateLimited };
