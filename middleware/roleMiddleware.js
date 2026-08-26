const User = require('../models/User');

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Access denied. Insufficient permissions.',
        requiredRoles: roles,
        currentRole: req.user?.role || null,
      });
    }
    next();
  };
};

module.exports = authorize;
