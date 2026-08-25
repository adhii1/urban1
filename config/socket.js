const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { Redis } = require('ioredis');
const logger = require('../utils/logger');
const config = require('./config');
const { verifyAccessToken } = require('../utils/jwtGenerator');
const TokenBlacklist = require('../models/TokenBlacklist');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Driver = require('../models/Driver');
const userCache = require('../utils/userCache');
const { cleanupSocketRateLimits } = require('../utils/socketRateLimiter');

const isDev = config.env === 'development';

let ioInstance = null;
let pubClient = null;
let subClient = null;

// Initialize Redis clients if configured
if (config.redis.enabled) {
  try {
    pubClient = new Redis(config.redis.url);
    subClient = pubClient.duplicate();

    pubClient.on('connect', () => logger.info('Redis pub client connected'));
    pubClient.on('error', (err) => logger.error('Redis pub client error:', err));
    subClient.on('connect', () => logger.info('Redis sub client connected'));
    subClient.on('error', (err) => logger.error('Redis sub client error:', err));
  } catch (err) {
    logger.error('Failed to initialize Redis clients:', err);
  }
}

// In-memory TTL cache for blacklisted tokens (shared with authMiddleware via
// the same approach but separate instance — both check the same DB collection).
const socketBlacklistCache = new Map();
const SOCKET_BLACKLIST_CACHE_MAX = 10000;

function isTokenBlacklisted(token) {
  const entry = socketBlacklistCache.get(token);
  if (entry) {
    if (Date.now() > entry.expiresAt) {
      socketBlacklistCache.delete(token);
      return false; // expired, treat as not blacklisted
    }
    return true;
  }
  return false;
}

function cacheBlacklistedToken(token, expiresAt) {
  if (socketBlacklistCache.size >= SOCKET_BLACKLIST_CACHE_MAX) {
    const toEvict = Math.floor(SOCKET_BLACKLIST_CACHE_MAX * 0.1);
    let deleted = 0;
    for (const [key] of socketBlacklistCache) {
      if (deleted >= toEvict) break;
      socketBlacklistCache.delete(key);
      deleted++;
    }
  }
  socketBlacklistCache.set(token, { expiresAt: expiresAt.getTime() });
}

// Connection-level rate limiting: track IP → connection count.
// Prevents socket-exhaustion attacks. Limits each IP to 10 connections
// per minute across all namespaces. Uses a sliding-window counter.
const ipConnections = new Map();
const IP_LIMIT = isDev ? 5000 : 10;
const IP_WINDOW_MS = 60 * 1000;

function checkIpRateLimit(ip) {
  const now = Date.now();
  const record = ipConnections.get(ip) || { count: 0, windowStart: now };
  if (now - record.windowStart > IP_WINDOW_MS) {
    record.count = 0;
    record.windowStart = now;
  }
  record.count += 1;
  ipConnections.set(ip, record);
  return record.count <= IP_LIMIT;
}

// Periodically purge stale IP entries to prevent memory growth.
// Also caps the map at 10000 entries as a safety net; beyond that,
// oldest entries are evicted proactively.
const IP_MAP_HARD_LIMIT = 10000;
setInterval(() => {
  const now = Date.now();
  if (ipConnections.size > IP_MAP_HARD_LIMIT) {
    // Evict oldest entries without full sort: iterate and delete until
    // we're below the limit. Uses entry order which is insertion-based.
    const toEvict = Math.floor(ipConnections.size / 2);
    let deleted = 0;
    for (const [ip] of ipConnections) {
      if (deleted >= toEvict) break;
      ipConnections.delete(ip);
      deleted++;
    }
  }
  for (const [ip, record] of ipConnections) {
    if (now - record.windowStart > IP_WINDOW_MS * 2) ipConnections.delete(ip);
  }
}, IP_WINDOW_MS * 2).unref();

const activeSockets = {
  admin: new Map(),
  driver: new Map(),
  customer: new Map(),
};

function emitToUser(namespace, userId, event, payload) {
  const sockets = activeSockets[namespace].get(userId);
  const socketMapKeys = Array.from(activeSockets[namespace].keys());
  const socketFound = !!sockets && sockets.size > 0;

  console.log('[EVENT_DELIVERY_TRACE] emitToUser lookup', {
    namespace,
    targetUserId: userId,
    event,
    socketMapKeys,
    socketMapSize: socketMapKeys.length,
    socketFound,
    matchedSocketCount: sockets ? sockets.size : 0,
  });

  if (!sockets) {
    console.log('[EVENT_DELIVERY_TRACE] emitToUser DROPPED - no entry for userId in activeSockets', {
      namespace,
      targetUserId: userId,
      event,
      socketFound: false,
      socketConnected: false,
      delivered: false,
    });
    return false;
  }

  let delivered = false;
  for (const socket of sockets) {
    console.log('[EVENT_DELIVERY_TRACE] emitToUser candidate socket', {
      namespace,
      targetUserId: userId,
      event,
      socketId: socket.id,
      socketFound: true,
      socketConnected: socket.connected,
    });
    if (socket.connected) {
      socket.emit(event, payload);
      delivered = true;
      console.log('[EVENT_DELIVERY_TRACE] emitToUser EMITTED', {
        namespace,
        targetUserId: userId,
        event,
        socketId: socket.id,
        eventEmitted: true,
      });
    }
  }

  if (!delivered) {
    console.log('[EVENT_DELIVERY_TRACE] emitToUser DROPPED - entry existed but no connected socket', {
      namespace,
      targetUserId: userId,
      event,
      socketFound: true,
      socketConnected: false,
      delivered: false,
    });
  }

  return delivered;
}

function emitToUsers(namespace, userIds, event, payload) {
  for (const id of userIds) emitToUser(namespace, id, event, payload);
}

// Cached unique-user counts, maintained incrementally on connect/disconnect.
// Avoids O(n) iteration on every admin stats call.
const connectedUserCount = { admin: 0, driver: 0, customer: 0 };

function getUserSocketCount(namespace) {
  return connectedUserCount[namespace] || 0;
}

const initSockets = (httpServer) => {
  logger.info('Initializing Socket.IO...');

  ioInstance = new Server(httpServer, {
    cors: {
      // Same rule as the HTTP layer, so a page that can call the API can also
      // open a socket. Passing the array directly used to silently drop LAN and
      // non-whitelisted-port clients at handshake time.
      origin: (origin, callback) => {
        if (config.cors.isAllowed(origin)) return callback(null, true);
        logger.warn(`Socket.IO CORS blocked origin: ${origin}`);
        return callback(null, false);
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true,
    },
  });

  // Use Redis adapter for horizontal scaling if configured
  if (config.redis.enabled && pubClient && subClient) {
    ioInstance.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.IO using Redis adapter for horizontal scaling');
  } else {
    logger.info('Socket.IO using default in-memory adapter (set REDIS_URL for production)');
  }

  ['admin', 'driver', 'customer'].forEach((nsName) => {
    const ns = ioInstance.of(`/sockets/${nsName}`);

    ns.on('connection', async (socket) => {
      const clientIp = socket.handshake.address || socket.conn.remoteAddress || 'unknown';
      if (!checkIpRateLimit(clientIp)) {
        logger.warn(`Socket connection rate limited: /sockets/${nsName} - IP: ${clientIp}`);
        socket.emit('error', { message: 'Too many connections. Please try again later.' });
        socket.disconnect(true);
        return;
      }

      // Also check for token in cookies (httpOnly cookie-based auth)
      let tokenFromCookie = null;
      const cookieHeader = socket.handshake.headers.cookie;
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').map(c => c.trim());
        const accessTokenCookie = cookies.find(c => c.startsWith('accessToken='));
        if (accessTokenCookie) {
          tokenFromCookie = accessTokenCookie.split('=')[1];
        }
      }
      let token = socket.handshake.auth?.token || tokenFromCookie;

      if (!token) {
        logger.warn(`Socket connection rejected: /sockets/${nsName} - no token`);
        socket.disconnect(true);
        return;
      }

      // If the explicit auth token was provided but stale, fall back to the
      // cookie (which the client keeps fresh via periodic /auth/refresh).
      try {
        verifyAccessToken(token);
      } catch {
        if (tokenFromCookie && token !== tokenFromCookie) {
          token = tokenFromCookie;
        }
      }

      try {
        if (!isTokenBlacklisted(token)) {
          const blacklisted = await TokenBlacklist.findOne({ token });
          if (blacklisted) {
            cacheBlacklistedToken(token, blacklisted.expiresAt);
            logger.warn(`Socket connection rejected: /sockets/${nsName} - blacklisted token`);
            socket.disconnect(true);
            return;
          }
        } else {
          logger.warn(`Socket connection rejected: /sockets/${nsName} - blacklisted token`);
          socket.disconnect(true);
          return;
        }

        const decoded = verifyAccessToken(token);
        socket.userId = decoded.id;

        const user = await User.findById(decoded.id);

        if (!user || user.status !== 'ACTIVE') {
          logger.warn(`Socket connection rejected: /sockets/${nsName} - user not found or inactive`);
          socket.disconnect(true);
          return;
        }

        const userId = user._id.toString();
        const role = user.role.toLowerCase();

        if (role !== nsName && !(nsName === 'admin' && role === 'admin')) {
          logger.warn(`Socket connection rejected: /sockets/${nsName} - role mismatch (${role})`);
          socket.disconnect(true);
          return;
        }

        logger.info(`Socket connected: /sockets/${nsName} [${socket.id}, UserID: ${userId}]`);
        socket.userId = userId;

        const isNewUser = !activeSockets[nsName].has(userId);
        if (isNewUser) {
          activeSockets[nsName].set(userId, new Set());
        }
        activeSockets[nsName].get(userId).add(socket);
        if (isNewUser) connectedUserCount[nsName] += 1;

        console.log('[SOCKET_REGISTRATION_TRACE] socket registered in activeSockets', {
          namespace: `/sockets/${nsName}`,
          userId,
          socketId: socket.id,
          isNewUserEntry: isNewUser,
          socketCountForUser: activeSockets[nsName].get(userId).size,
          socketMapKeys: Array.from(activeSockets[nsName].keys()),
        });

        // Pre-populate per-user info for socket handlers. For customers this
        // resolves to their Customer profile; for drivers/admins we still
        // store the User document so handlers can grab name/phone.
        if (nsName === 'customer') {
          const customer = await Customer.findOne({ userId: user._id }).select('name').lean();
          userCache.setUserInfo(userId, { name: customer && customer.name, phone: user.phone });
          socket.customerName = customer && customer.name;
          socket.customerPhone = user.phone;
        } else {
          userCache.setUserInfo(userId, { name: user.phone, phone: user.phone });
        }

        socket.on('disconnect', (reason) => {
          const set = activeSockets[nsName].get(userId);
          if (set) {
            const remaining = set.size;
            set.delete(socket);
            if (set.size === 0) {
              activeSockets[nsName].delete(userId);
              if (connectedUserCount[nsName] > 0) connectedUserCount[nsName] -= 1;
              if (nsName === 'customer') userCache.clearUserInfo(userId);
            }
            if (nsName === 'driver' && remaining === 1) {
              Driver.findOneAndUpdate({ userId }, { isOnline: false, isAvailable: false }).catch(() => { });
            }
            console.log('[SOCKET_REGISTRATION_TRACE] socket removed from activeSockets', {
              namespace: `/sockets/${nsName}`,
              userId,
              socketId: socket.id,
              reason,
              remainingBeforeDelete: remaining,
              userEntryRemoved: !activeSockets[nsName].has(userId),
              socketMapKeys: Array.from(activeSockets[nsName].keys()),
            });
          } else {
            console.log('[SOCKET_REGISTRATION_TRACE] socket disconnect fired but no activeSockets entry existed for userId', {
              namespace: `/sockets/${nsName}`,
              userId,
              socketId: socket.id,
              reason,
            });
          }
          cleanupSocketRateLimits(socket.id);
          logger.info(`Socket disconnected: /sockets/${nsName} [${socket.id}, Reason: ${reason}]`);
        });
      } catch (error) {
        logger.warn(`Socket connection rejected: /sockets/${nsName} - ${error.message}`);
        socket.disconnect(true);
      }
    });
  });

  const { registerDriverEvents } = require('../sockets/driverEvents');
  const { registerCustomerEvents } = require('../sockets/customerEvents');
  const { registerAdminEvents } = require('../sockets/adminEvents');
  const ridePairing = require('../services/ridePairingService');
  const rideExpiry = require('../services/rideExpiryService');

  registerDriverEvents(ioInstance);
  registerCustomerEvents(ioInstance);
  registerAdminEvents(ioInstance);

  ridePairing.refreshFromDatabase().then(() => {
    ridePairing.syncDriverAvailability(logger);
  }).catch((err) => {
    logger.error('Failed to refresh ride pairings from DB on startup', { error: err.message });
  });

  rideExpiry.expirePendingRides().catch((err) => {
    logger.error('Initial ride expiry sweep failed', { error: err.message });
  });
  rideExpiry.start();
  ridePairing.startPeriodicRefresh(logger);

  return ioInstance;
};

const getIO = () => {
  if (!ioInstance) throw new Error('Socket.IO not initialized.');
  return ioInstance;
};

module.exports = { initSockets, getIO, activeSockets, emitToUser, emitToUsers, getUserSocketCount };