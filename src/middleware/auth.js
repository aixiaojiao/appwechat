const { jwtUtils, TokenError } = require('../utils/jwt');
const User = require('../models/User');

/**
 * Authentication Middleware
 * Handles JWT token validation and user authentication for protected routes
 */

/**
 * Require authentication middleware
 * Validates JWT token and attaches user to request
 */
const requireAuth = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const token = jwtUtils.extractTokenFromHeader(authHeader);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'missing_token',
        message: 'Authorization token is required'
      });
    }

    // Verify token
    const decoded = jwtUtils.verifyAccessToken(token);

    // Find user in database
    const user = await User.findByWechatId(decoded.openId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'user_not_found',
        message: 'User not found'
      });
    }

    // Attach user and token info to request
    req.user = user;
    req.tokenData = {
      openId: decoded.openId,
      userId: decoded.userId,
      role: decoded.role,
      jti: decoded.jti
    };

    next();

  } catch (error) {
    console.error('Authentication middleware error:', error);

    if (error instanceof TokenError) {
      const statusCode = error.isExpired() ? 401 : 403;
      const errorCode = error.isExpired() ? 'token_expired' : 'invalid_token';
      
      return res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'authentication_error',
      message: 'Authentication failed'
    });
  }
};

/**
 * Optional authentication middleware
 * Validates token if present but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = jwtUtils.extractTokenFromHeader(authHeader);

    if (!token) {
      // No token provided, continue without authentication
      req.user = null;
      req.tokenData = null;
      return next();
    }

    // Verify token
    const decoded = jwtUtils.verifyAccessToken(token);

    // Find user in database
    const user = await User.findByWechatId(decoded.openId);
    if (user) {
      req.user = user;
      req.tokenData = {
        openId: decoded.openId,
        userId: decoded.userId,
        role: decoded.role,
        jti: decoded.jti
      };
    } else {
      req.user = null;
      req.tokenData = null;
    }

    next();

  } catch (error) {
    // For optional auth, continue even if token is invalid
    console.warn('Optional auth middleware warning:', error.message);
    req.user = null;
    req.tokenData = null;
    next();
  }
};

/**
 * Role-based authorization middleware
 * Requires authentication and specific role
 */
const requireRole = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      // First require authentication
      await new Promise((resolve, reject) => {
        requireAuth(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Check if user has required role
      const userRole = req.tokenData?.role || 'user';
      
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          error: 'insufficient_permissions',
          message: 'Insufficient permissions for this resource'
        });
      }

      next();

    } catch (error) {
      // Error already handled by requireAuth
      if (!res.headersSent) {
        res.status(403).json({
          success: false,
          error: 'authorization_failed',
          message: 'Authorization failed'
        });
      }
    }
  };
};

/**
 * Admin role requirement
 */
const requireAdmin = requireRole('admin');

/**
 * User or admin role requirement
 */
const requireUserOrAdmin = requireRole('user', 'admin');

/**
 * Resource ownership middleware
 * Ensures user can only access their own resources
 */
const requireOwnership = (userIdParam = 'userId') => {
  return async (req, res, next) => {
    try {
      // First require authentication
      if (!req.user || !req.tokenData) {
        return res.status(401).json({
          success: false,
          error: 'authentication_required',
          message: 'Authentication required'
        });
      }

      // Get target user ID from request parameters
      const targetUserId = req.params[userIdParam] || req.body[userIdParam];
      const currentUserId = req.tokenData.userId;

      // Check if user is accessing their own resource or is admin
      if (req.tokenData.role === 'admin' || 
          (targetUserId && parseInt(targetUserId) === parseInt(currentUserId))) {
        return next();
      }

      res.status(403).json({
        success: false,
        error: 'access_denied',
        message: 'Access denied: You can only access your own resources'
      });

    } catch (error) {
      console.error('Ownership middleware error:', error);
      res.status(500).json({
        success: false,
        error: 'authorization_error',
        message: 'Authorization check failed'
      });
    }
  };
};

/**
 * Rate limiting by user ID
 * More specific rate limiting for authenticated users
 */
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const userRequestMap = new Map();

  return async (req, res, next) => {
    try {
      // Get user identifier
      const userId = req.tokenData?.userId || req.ip || 'anonymous';
      const now = Date.now();
      const windowStart = now - windowMs;

      // Clean up old entries
      for (const [key, requests] of userRequestMap.entries()) {
        const validRequests = requests.filter(timestamp => timestamp > windowStart);
        if (validRequests.length === 0) {
          userRequestMap.delete(key);
        } else {
          userRequestMap.set(key, validRequests);
        }
      }

      // Check current requests
      const currentRequests = userRequestMap.get(userId) || [];
      const recentRequests = currentRequests.filter(timestamp => timestamp > windowStart);

      if (recentRequests.length >= maxRequests) {
        return res.status(429).json({
          success: false,
          error: 'rate_limit_exceeded',
          message: 'Rate limit exceeded. Please try again later.'
        });
      }

      // Add current request
      recentRequests.push(now);
      userRequestMap.set(userId, recentRequests);
      next();

    } catch (error) {
      console.error('User rate limit error:', error);
      next(); // Continue on rate limit errors
    }
  };
};

/**
 * Request logging middleware for authenticated routes
 */
const logAuthenticatedRequest = (req, res, next) => {
  if (req.user && req.tokenData) {
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      userId: req.tokenData.userId,
      openId: req.tokenData.openId?.substring(0, 8) + '...',
      ip: req.ip,
      userAgent: req.headers['user-agent']
    };
    
    console.log('Authenticated request:', JSON.stringify(logData));
  }
  next();
};

/**
 * Security headers middleware
 */
const securityHeaders = (req, res, next) => {
  // Prevent token caching
  res.set({
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  });
  next();
};

/**
 * Token refresh reminder middleware
 * Adds header when token is close to expiration
 */
const tokenRefreshReminder = (req, res, next) => {
  if (req.tokenData) {
    const token = jwtUtils.extractTokenFromHeader(req.headers.authorization);
    const tokenInfo = jwtUtils.getTokenInfo(token);
    
    if (tokenInfo && tokenInfo.expiresAt) {
      const timeUntilExpiry = tokenInfo.expiresAt.getTime() - Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      
      if (timeUntilExpiry < fiveMinutes && timeUntilExpiry > 0) {
        res.set('X-Token-Refresh-Needed', 'true');
        res.set('X-Token-Expires-At', tokenInfo.expiresAt.toISOString());
      }
    }
  }
  next();
};

module.exports = {
  requireAuth,
  optionalAuth,
  requireRole,
  requireAdmin,
  requireUserOrAdmin,
  requireOwnership,
  userRateLimit,
  logAuthenticatedRequest,
  securityHeaders,
  tokenRefreshReminder
};