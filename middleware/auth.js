const jwt = require('jsonwebtoken');
const User = require('../models/User');

const isInsecureTestMode = () =>
  process.env.ENABLE_INSECURE_TEST_AUTH === 'true';

const getJwtSecret = () => {
  // This opt-in test mode is off by default. Do not enable it on an internet-
  // facing deployment unless accepting the risk of a known administrator login.
  if (isInsecureTestMode()) {
    return process.env.JWT_SECRET || 'local-test-only-jwt-secret-change-before-production-2026';
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }
  return process.env.JWT_SECRET;
};

// Middleware to verify JWT token
const authenticate = async (req, res, next) => {
  try {
    // Try to get token from cookie first, then from Authorization header (fallback for existing sessions)
    let token = req.cookies?.homeo_token || req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, getJwtSecret());
    
    // Find user
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - user not found'
      });
    }

    // Check if user is active and approved
    if (!user.isActive || user.status !== 'Approved') {
      return res.status(403).json({
        success: false,
        message: 'Account is not active or not approved'
      });
    }

    req.user = {
      userId: decoded.userId,          // keep JWT payload field for backwards compat
      ...user.toObject(),              // merge full user doc (includes _id, role, etc.)
      _id: user._id                    // ensure Mongoose ObjectId is available
    };
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired'
      });
    }
    
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

// Middleware to check if user has required roles
const requireRoles = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }
    next();
  };
};

const requireClinicalUser = requireRoles(['Admin', 'Core Team', 'External Doctor']);

module.exports = {
  authenticate,
  requireAdmin,
  requireRoles,
  requireClinicalUser,
  getJwtSecret,
  isInsecureTestMode,
};
