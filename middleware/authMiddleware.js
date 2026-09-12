const { verifyAccessToken } = require('../utils/jwtGenerator');
const formatError = require('../utils/errorFormatter');
const TokenBlacklist = require('../models/TokenBlacklist');
const User = require('../models/User');
const Driver = require('../models/Driver');
const Corporate = require('../models/Corporate');

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
  if (authHeader && typeof authHeader === 'string') {
    const parts = authHeader.trim().split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      const val = parts[1].trim();
      if (val && val !== 'null' && val !== 'undefined' && val !== '""') {
        token = val;
      }
    }
  }
  
  if (!token && req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) return res.status(401).json(formatError('Access denied. Authorization token missing.', [{ code: 'TOKEN_MISSING' }]));

  try {
    // Check in-memory cache first, then DB on cache miss
    if (!getCachedBlacklist(token)) {
      const blacklisted = await TokenBlacklist.findOne({ token });
      if (blacklisted) {
        setCachedBlacklist(token, blacklisted.expiresAt);
        return res.status(401).json(formatError('Access denied. Token revoked.', [{ code: 'TOKEN_REVOKED' }]));
      }
    } else {
      return res.status(401).json(formatError('Access denied. Token revoked.', [{ code: 'TOKEN_REVOKED' }]));
    }

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json(formatError('Access denied. User not found.', [{ code: 'USER_NOT_FOUND' }]));
    if (user.status === 'SUSPENDED') return res.status(403).json(formatError('Access denied. Account suspended.', [{ code: 'ACCOUNT_SUSPENDED' }]));
    if (user.status === 'INACTIVE') return res.status(403).json(formatError('Access denied. Account inactive.', [{ code: 'ACCOUNT_INACTIVE' }]));

    // User.status only tracks account-level suspension/deactivation. Driver
    // and Corporate carry their own approval-workflow status (e.g. a Corporate
    // can be demoted from ACTIVE back to PENDING/REJECTED, or a Driver's
    // approval revoked) which was previously only enforced at login time —
    // an already-issued token kept working against a de-approved profile
    // until it naturally expired. Both fields are indexed on userId, so this
    // is a single cheap lookup per request.
    if (user.role === 'Driver') {
      const driver = await Driver.findOne({ userId: user._id }).select('status').lean();
      if (!driver) return res.status(401).json(formatError('Access denied. Driver profile not found.', [{ code: 'PROFILE_NOT_FOUND' }]));
      if (driver.status === 'SUSPENDED') return res.status(403).json(formatError('Access denied. Driver account suspended.', [{ code: 'ACCOUNT_SUSPENDED' }]));
      if (driver.status === 'INACTIVE') return res.status(403).json(formatError('Access denied. Driver account inactive.', [{ code: 'ACCOUNT_INACTIVE' }]));
      if (driver.status === 'PENDING_APPROVAL') return res.status(403).json(formatError('Access denied. Driver account pending approval.', [{ code: 'ACCOUNT_PENDING_APPROVAL' }]));
    } else if (user.role === 'Corporate') {
      const corporate = await Corporate.findOne({ userId: user._id }).select('status').lean();
      if (!corporate) return res.status(401).json(formatError('Access denied. Corporate profile not found.', [{ code: 'PROFILE_NOT_FOUND' }]));
      if (corporate.status === 'SUSPENDED') return res.status(403).json(formatError('Access denied. Corporate account suspended.', [{ code: 'ACCOUNT_SUSPENDED' }]));
      if (corporate.status === 'INACTIVE') return res.status(403).json(formatError('Access denied. Corporate account inactive.', [{ code: 'ACCOUNT_INACTIVE' }]));
      if (corporate.status === 'PENDING') return res.status(403).json(formatError('Access denied. Corporate account pending approval.', [{ code: 'ACCOUNT_PENDING_APPROVAL' }]));
      if (corporate.status === 'REJECTED') return res.status(403).json(formatError('Access denied. Corporate account rejected.', [{ code: 'ACCOUNT_REJECTED' }]));
    }

    req.user = { id: user._id, role: user.role, status: user.status, phone: user.phone };
    req.token = token;
    next();
  } catch (error) {
    const isExpired = error.name === 'TokenExpiredError';
    return res.status(401).json(formatError(
      isExpired ? 'Access denied. Token expired.' : 'Access denied. Invalid or expired token.',
      [{ code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID', message: error.message }]
    ));
  }
};

module.exports = authenticate;
