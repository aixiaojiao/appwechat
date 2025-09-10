const { WeChatService, WeChatAPIError } = require('../services/wechatService');
const { jwtUtils, TokenError } = require('../utils/jwt');
const User = require('../models/User');

/**
 * Authentication Controller
 * Handles WeChat OAuth authentication and token management
 */
class AuthController {
  constructor() {
    this.wechatService = new WeChatService();
    
    // Rate limiting per IP address
    this.rateLimitMap = new Map();
    this.MAX_AUTH_ATTEMPTS = 10; // per 15 minutes
    this.RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * WeChat OAuth authentication endpoint
   * POST /auth/wechat
   */
  async wechatAuth(req, res) {
    try {
      // Input validation
      const { code, appId } = req.body;
      
      if (!code || !appId) {
        return res.status(400).json({
          success: false,
          error: 'validation_error',
          message: 'Missing required parameters: code and appId are required'
        });
      }

      // Validate input formats
      if (!WeChatService.validateAuthCode(code)) {
        return res.status(400).json({
          success: false,
          error: 'invalid_code',
          message: 'Invalid authorization code format'
        });
      }

      if (!WeChatService.validateAppId(appId)) {
        return res.status(400).json({
          success: false,
          error: 'invalid_app_id',
          message: 'Invalid WeChat App ID format'
        });
      }

      // Rate limiting check
      const clientIP = this.getClientIP(req);
      if (!this.checkRateLimit(clientIP)) {
        return res.status(429).json({
          success: false,
          error: 'rate_limit_exceeded',
          message: 'Too many authentication attempts. Please try again later.'
        });
      }

      // Get WeChat app secret from environment
      const appSecret = process.env.WECHAT_APP_SECRET;
      if (!appSecret) {
        console.error('WECHAT_APP_SECRET not configured');
        return res.status(500).json({
          success: false,
          error: 'server_configuration_error',
          message: 'Server configuration error'
        });
      }

      // Exchange code for WeChat session
      const wechatSession = await this.wechatService.code2Session(code, appId, appSecret);

      // Find or create user
      const user = await User.findOrCreateByWechat({
        openid: wechatSession.openid,
        // Note: WeChat Mini-Programs don't provide user profile in code2session
        // User profile would need to be obtained separately if needed
      });

      // Update user's last login
      await user.updateLastLogin();

      // Generate JWT tokens
      const tokenPayload = {
        openId: wechatSession.openid,
        userId: user.get('id'),
        role: 'user'
      };

      const tokens = jwtUtils.generateTokenPair(tokenPayload);

      // Log successful authentication (without sensitive data)
      console.log(`User authenticated successfully: ${user.get('id')} (${wechatSession.openid.substring(0, 8)}...)`);

      // Return success response
      res.status(200).json({
        success: true,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          openId: wechatSession.openid,
          nickname: user.get('nickname'),
          avatar: user.get('avatar_url')
        },
        expiresIn: tokens.expiresIn
      });

    } catch (error) {
      console.error('WeChat authentication error:', error);

      if (error instanceof WeChatAPIError) {
        // Handle specific WeChat API errors
        const statusCode = this.getWeChatErrorStatusCode(error.errcode);
        return res.status(statusCode).json({
          success: false,
          error: 'wechat_api_error',
          message: error.getUserFriendlyMessage(),
          code: error.errcode
        });
      }

      // Handle general authentication errors
      res.status(500).json({
        success: false,
        error: 'authentication_failed',
        message: 'Authentication failed. Please try again.'
      });
    }
  }

  /**
   * Refresh access token using refresh token
   * POST /auth/refresh
   */
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'missing_refresh_token',
          message: 'Refresh token is required'
        });
      }

      // Generate new access token
      const newTokens = jwtUtils.refreshAccessToken(refreshToken);

      res.status(200).json({
        success: true,
        ...newTokens
      });

    } catch (error) {
      console.error('Token refresh error:', error);

      if (error instanceof TokenError) {
        const statusCode = error.isExpired() ? 401 : 400;
        return res.status(statusCode).json({
          success: false,
          error: 'token_refresh_failed',
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'token_refresh_failed',
        message: 'Failed to refresh token'
      });
    }
  }

  /**
   * Logout endpoint - blacklist tokens
   * POST /auth/logout
   */
  async logout(req, res) {
    try {
      // Get token from Authorization header
      const authHeader = req.headers.authorization;
      const accessToken = jwtUtils.extractTokenFromHeader(authHeader);

      const { refreshToken } = req.body;

      // Blacklist both tokens
      if (accessToken) {
        jwtUtils.blacklistToken(accessToken);
      }

      if (refreshToken) {
        jwtUtils.blacklistToken(refreshToken);
      }

      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });

    } catch (error) {
      console.error('Logout error:', error);
      
      // Even if there's an error, we should respond successfully for logout
      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    }
  }

  /**
   * Get current user profile
   * GET /auth/profile
   */
  async getProfile(req, res) {
    try {
      // User should be attached to req by auth middleware
      const user = req.user;

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'unauthorized',
          message: 'Authentication required'
        });
      }

      res.status(200).json({
        success: true,
        user: user.getProfile()
      });

    } catch (error) {
      console.error('Get profile error:', error);

      res.status(500).json({
        success: false,
        error: 'profile_fetch_failed',
        message: 'Failed to fetch user profile'
      });
    }
  }

  /**
   * Verify token endpoint (for client-side validation)
   * POST /auth/verify
   */
  async verifyToken(req, res) {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'missing_token',
          message: 'Token is required'
        });
      }

      const decoded = jwtUtils.verifyAccessToken(token);
      const tokenInfo = jwtUtils.getTokenInfo(token);

      res.status(200).json({
        success: true,
        valid: true,
        tokenInfo: {
          openId: decoded.openId,
          userId: decoded.userId,
          role: decoded.role,
          expiresAt: tokenInfo.expiresAt,
          issuedAt: tokenInfo.issuedAt
        }
      });

    } catch (error) {
      if (error instanceof TokenError) {
        return res.status(401).json({
          success: true,
          valid: false,
          error: error.code,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'verification_failed',
        message: 'Token verification failed'
      });
    }
  }

  /**
   * Check rate limiting for authentication attempts
   */
  checkRateLimit(identifier) {
    const now = Date.now();
    const windowStart = now - this.RATE_LIMIT_WINDOW;

    // Clean up old entries
    for (const [key, attempts] of this.rateLimitMap.entries()) {
      const validAttempts = attempts.filter(timestamp => timestamp > windowStart);
      if (validAttempts.length === 0) {
        this.rateLimitMap.delete(key);
      } else {
        this.rateLimitMap.set(key, validAttempts);
      }
    }

    // Check current attempts
    const currentAttempts = this.rateLimitMap.get(identifier) || [];
    const recentAttempts = currentAttempts.filter(timestamp => timestamp > windowStart);

    if (recentAttempts.length >= this.MAX_AUTH_ATTEMPTS) {
      return false;
    }

    // Add current attempt
    recentAttempts.push(now);
    this.rateLimitMap.set(identifier, recentAttempts);
    return true;
  }

  /**
   * Get client IP address from request
   */
  getClientIP(req) {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           '127.0.0.1';
  }

  /**
   * Map WeChat error codes to HTTP status codes
   */
  getWeChatErrorStatusCode(errcode) {
    const errorCodeMap = {
      40013: 400, // Invalid App ID
      40029: 400, // Invalid code
      45011: 429, // API frequency limit
      40226: 400, // High risk user
      '-1': 502,  // System error
      '-1.0': 502 // System error (alternative format)
    };

    return errorCodeMap[errcode] || 400;
  }

  /**
   * Health check endpoint for authentication service
   * GET /auth/health
   */
  async healthCheck(req, res) {
    try {
      // Check if required environment variables are set
      const requiredEnvVars = ['WECHAT_APP_SECRET', 'JWT_SECRET'];
      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

      const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'authentication',
        version: '1.0.0',
        checks: {
          environment: missingVars.length === 0 ? 'ok' : 'warning',
          wechat_service: 'ok',
          jwt_service: 'ok'
        }
      };

      if (missingVars.length > 0) {
        health.warnings = [`Missing environment variables: ${missingVars.join(', ')}`];
        health.status = 'warning';
      }

      res.status(200).json(health);

    } catch (error) {
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        service: 'authentication',
        error: 'Health check failed'
      });
    }
  }
}

module.exports = AuthController;