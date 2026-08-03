// Use a Map keyed by socket ID (not a WeakMap keyed by the socket object).
// This prevents a client from bypassing the rate limit by disconnecting and
// reconnecting — the old socket object would be GC'd, causing a WeakMap entry
// to vanish. With a socket-ID map the counter persists for the window duration
// even after disconnect.
const buckets = new Map();

function makeRateLimiter({ max, windowMs }) {
  return (socket, event) => {
    if (!socket || !event) return true;
    const socketId = socket.id || socket.userId || 'unknown';
    let perSocket = buckets.get(socketId);
    if (!perSocket) {
      perSocket = new Map();
      buckets.set(socketId, perSocket);
    }
    const now = Date.now();
    const key = event;
    let entry = perSocket.get(key);
    if (!entry || now - entry.start >= windowMs) {
      entry = { start: now, count: 0 };
      perSocket.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= max;
  };
}

function cleanupSocketRateLimits(socketId) {
  if (socketId) buckets.delete(socketId);
}

// Periodically purge stale entries to prevent unbounded memory growth.
setInterval(() => {
  const now = Date.now();
  for (const [sid, perSocket] of buckets) {
    for (const [event, entry] of perSocket) {
      if (now - entry.start > 120 * 1000) perSocket.delete(event);
    }
    if (perSocket.size === 0) buckets.delete(sid);
  }
}, 60 * 1000).unref();

const rideRequestLimiter = makeRateLimiter({ max: 1, windowMs: 30 * 1000 });
const driverLocationLimiter = makeRateLimiter({ max: 1, windowMs: 5 * 1000 });
const driverOnlineLimiter = makeRateLimiter({ max: 1, windowMs: 10 * 1000 });
const rideActionLimiter = makeRateLimiter({ max: 10, windowMs: 60 * 1000 });
const otpVerifyLimiter = makeRateLimiter({ max: 5, windowMs: 5 * 60 * 1000 });
const adminActionLimiter = makeRateLimiter({ max: 15, windowMs: 60 * 1000 });

module.exports = {
  rideRequestLimiter,
  driverLocationLimiter,
  driverOnlineLimiter,
  rideActionLimiter,
  otpVerifyLimiter,
  adminActionLimiter,
  cleanupSocketRateLimits,
};
