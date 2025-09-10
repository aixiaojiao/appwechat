const express = require('express');
const rateLimit = require('express-rate-limit');
const AuthController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const authController = new AuthController();

/**
 * Rate limiting configuration for authentication endpoints
 */
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 authentication requests per windowMs
  message: {
    success: false,
    error: 'rate_limit_exceeded',
    message: 'Too many authentication attempts. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for successful requests (optional)
  skipSuccessfulRequests: false
});

const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // More lenient for general endpoints
  message: {
    success: false,
    error: 'rate_limit_exceeded',
    message: 'Too many requests. Please try again later.'
  }
});

/**
 * Input validation middleware
 */
const validateWeChatAuth = (req, res, next) => {
  const { code, appId } = req.body;
  
  // Check for required fields
  if (!code || !appId) {
    return res.status(400).json({
      success: false,
      error: 'validation_error',
      message: 'Missing required fields: code and appId'
    });
  }

  // Validate data types
  if (typeof code !== 'string' || typeof appId !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'validation_error',
      message: 'Invalid data types: code and appId must be strings'
    });
  }

  // Validate field lengths
  if (code.length < 10 || code.length > 50) {
    return res.status(400).json({
      success: false,
      error: 'validation_error',
      message: 'Invalid code length'
    });
  }

  if (appId.length !== 18) { // wx + 16 characters
    return res.status(400).json({
      success: false,
      error: 'validation_error',
      message: 'Invalid appId length'
    });
  }

  next();
};

const validateRefreshToken = (req, res, next) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      error: 'validation_error',
      message: 'Missing required field: refreshToken'
    });
  }

  if (typeof refreshToken !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'validation_error',
      message: 'Invalid data type: refreshToken must be a string'
    });
  }

  next();
};

/**
 * Authentication Routes
 */

/**
 * POST /auth/wechat
 * WeChat OAuth authentication
 * 
 * Body:
 * - code: WeChat authorization code (string, required)
 * - appId: WeChat mini-program App ID (string, required)
 * 
 * Response:
 * - 200: Authentication successful
 * - 400: Invalid request data
 * - 429: Rate limit exceeded
 * - 500: Server error
 */
router.post('/wechat', 
  authRateLimit,
  validateWeChatAuth,
  async (req, res) => {
    await authController.wechatAuth(req, res);
  }
);

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 * 
 * Body:
 * - refreshToken: JWT refresh token (string, required)
 * 
 * Response:
 * - 200: Token refreshed successfully
 * - 400: Invalid refresh token
 * - 401: Expired refresh token
 * - 500: Server error
 */
router.post('/refresh',
  generalRateLimit,
  validateRefreshToken,
  async (req, res) => {
    await authController.refreshToken(req, res);
  }
);

/**
 * POST /auth/logout
 * Logout user and blacklist tokens
 * 
 * Headers:
 * - Authorization: Bearer <access_token> (optional)
 * 
 * Body:
 * - refreshToken: JWT refresh token (string, optional)
 * 
 * Response:
 * - 200: Logout successful (always returns success)
 */
router.post('/logout',
  generalRateLimit,
  async (req, res) => {
    await authController.logout(req, res);
  }
);

/**
 * GET /auth/profile
 * Get current user profile (protected route)
 * 
 * Headers:
 * - Authorization: Bearer <access_token> (required)
 * 
 * Response:
 * - 200: Profile retrieved successfully
 * - 401: Authentication required
 * - 500: Server error
 */
router.get('/profile',
  generalRateLimit,
  authMiddleware.requireAuth,
  async (req, res) => {
    await authController.getProfile(req, res);
  }
);

/**
 * POST /auth/verify
 * Verify token validity (for client-side validation)
 * 
 * Body:
 * - token: JWT access token (string, required)
 * 
 * Response:
 * - 200: Token verification result
 * - 400: Missing token
 * - 500: Server error
 */
router.post('/verify',
  generalRateLimit,
  (req, res, next) => {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'Missing required field: token'
      });
    }

    if (typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'Invalid data type: token must be a string'
      });
    }

    next();
  },
  async (req, res) => {
    await authController.verifyToken(req, res);
  }
);

/**
 * GET /auth/health
 * Health check endpoint for authentication service
 * 
 * Response:
 * - 200: Service healthy
 * - 503: Service unhealthy
 */
router.get('/health',
  async (req, res) => {
    await authController.healthCheck(req, res);
  }
);

/**
 * Error handling middleware for auth routes
 */
router.use((error, req, res, next) => {
  console.error('Auth route error:', error);

  // Handle validation errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'validation_error',
      message: error.message
    });
  }

  // Handle JSON parsing errors
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({
      success: false,
      error: 'invalid_json',
      message: 'Invalid JSON in request body'
    });
  }

  // Default error response
  res.status(500).json({
    success: false,
    error: 'internal_server_error',
    message: 'An unexpected error occurred'
  });
});

module.exports = router;