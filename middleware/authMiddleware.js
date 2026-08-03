const { verifyAccessToken } = require('../utils/jwtGenerator');
const formatError = require('../utils/errorFormatter');
const TokenBlacklist = require('../models/TokenBlacklist');
const User = require('../models/User');

// In-memory TTL cache for blacklisted tokens. Avoids a DB query on every
// authenticated request. Max 10000 entries; entries are evicted on access
// when expired.
const blacklistCache = new Map();
const BLACKLIST_CACHE_MAX = 10000;

function getCachedBlacklist(token) {
  const entry = blacklistCache.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    blacklistCache.delete(token);
    return null;
  }
  return true;
}

function setCachedBlacklist(token, expiresAt) {
  if (blacklistCache.size >= BLACKLIST_CACHE_MAX) {
    // Evict oldest 10% of entries
    const toEvict = Math.floor(BLACKLIST_CACHE_MAX * 0.1);
    let deleted = 0;
    for (const [key] of blacklistCache) {
      if (deleted >= toEvict) break;
      blacklistCache.delete(key);
      deleted++;
    }
  }
  blacklistCache.set(token, { expiresAt: expiresAt.getTime() });
}

const authenticate = async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) return res.status(401).json(formatError('Access denied. Authorization token missing.'));

  try {
    // Check in-memory cache first, then DB on cache miss
    if (!getCachedBlacklist(token)) {
      const blacklisted = await TokenBlacklist.findOne({ token });
      if (blacklisted) {
        setCachedBlacklist(token, blacklisted.expiresAt);
        return res.status(401).json(formatError('Access denied. Token revoked.'));
      }
    } else {
      return res.status(401).json(formatError('Access denied. Token revoked.'));
    }

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json(formatError('Access denied. User not found.'));
    if (user.status === 'SUSPENDED') return res.status(403).json(formatError('Access denied. Account suspended.'));
    if (user.status === 'INACTIVE') return res.status(403).json(formatError('Access denied. Account inactive.'));

    req.user = { id: user._id, role: user.role, status: user.status, phone: user.phone };
    req.token = token;
    next();
  } catch (error) {
    return res.status(401).json(formatError('Access denied. Invalid or expired token.'));
  }
};

module.exports = authenticate;
