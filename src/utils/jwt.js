const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * JWT Token Management Utilities
 * Handles secure token generation, validation, and management
 */
class JWTUtils {
  constructor() {
    // Load secrets from environment variables
    this.accessTokenSecret = process.env.JWT_SECRET || this.generateSecret();
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET || this.generateSecret();
    
    // Token expiration times
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '1h';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '30d';
    
    // Algorithm for signing
    this.algorithm = 'HS256';
    
    // In-memory token blacklist (use Redis in production)
    this.blacklistedTokens = new Set();
    
    // Warn if using generated secrets (not secure for production)
    if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
      console.warn('⚠️  Warning: Using generated JWT secrets. Set JWT_SECRET and JWT_REFRESH_SECRET environment variables for production');
    }
  }

  /**
   * Generate a secure random secret
   */
  generateSecret() {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Generate JWT access token
   */
  generateAccessToken(payload) {
    if (!payload || !payload.openId) {
      throw new Error('Invalid payload: openId is required');
    }

    // Standard JWT claims
    const tokenPayload = {
      openId: payload.openId,
      userId: payload.userId,
      role: payload.role || 'user',
      type: 'access',
      // Issued at
      iat: Math.floor(Date.now() / 1000),
      // JWT ID for tracking
      jti: crypto.randomUUID()
    };

    try {
      return jwt.sign(tokenPayload, this.accessTokenSecret, {
        expiresIn: this.accessTokenExpiry,
        algorithm: this.algorithm,
        issuer: 'storyspark-api',
        audience: 'storyspark-client'
      });
    } catch (error) {
      console.error('Error generating access token:', error.message);
      throw new Error('Failed to generate access token');
    }
  }

  /**
   * Generate JWT refresh token
   */
  generateRefreshToken(payload) {
    if (!payload || !payload.openId) {
      throw new Error('Invalid payload: openId is required');
    }

    const tokenPayload = {
      openId: payload.openId,
      userId: payload.userId,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000),
      jti: crypto.randomUUID()
    };

    try {
      return jwt.sign(tokenPayload, this.refreshTokenSecret, {
        expiresIn: this.refreshTokenExpiry,
        algorithm: this.algorithm,
        issuer: 'storyspark-api',
        audience: 'storyspark-client'
      });
    } catch (error) {
      console.error('Error generating refresh token:', error.message);
      throw new Error('Failed to generate refresh token');
    }
  }

  /**
   * Generate both access and refresh tokens
   */
  generateTokenPair(payload) {
    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.getTokenExpiry(this.accessTokenExpiry),
      tokenType: 'Bearer'
    };
  }

  /**
   * Verify and decode JWT token
   */
  verifyToken(token, type = 'access') {
    if (!token) {
      throw new TokenError('Token is required', 'MISSING_TOKEN');
    }

    // Check if token is blacklisted
    if (this.blacklistedTokens.has(token)) {
      throw new TokenError('Token has been revoked', 'REVOKED_TOKEN');
    }

    const secret = type === 'access' ? this.accessTokenSecret : this.refreshTokenSecret;

    try {
      const decoded = jwt.verify(token, secret, {
        algorithms: [this.algorithm],
        issuer: 'storyspark-api',
        audience: 'storyspark-client'
      });

      // Validate token type
      if (decoded.type !== type) {
        throw new TokenError(`Invalid token type: expected ${type}`, 'INVALID_TOKEN_TYPE');
      }

      return decoded;
    } catch (error) {
      if (error instanceof TokenError) {
        throw error;
      }

      // Handle JWT-specific errors
      if (error.name === 'TokenExpiredError') {
        throw new TokenError('Token has expired', 'EXPIRED_TOKEN');
      }

      if (error.name === 'JsonWebTokenError') {
        throw new TokenError('Invalid token', 'INVALID_TOKEN');
      }

      if (error.name === 'NotBeforeError') {
        throw new TokenError('Token not active yet', 'INACTIVE_TOKEN');
      }

      console.error('Token verification error:', error.message);
      throw new TokenError('Token verification failed', 'VERIFICATION_FAILED');
    }
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token) {
    return this.verifyToken(token, 'access');
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token) {
    return this.verifyToken(token, 'refresh');
  }

  /**
   * Decode token without verification (for inspection)
   */
  decodeToken(token) {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if token is expired without throwing error
   */
  isTokenExpired(token) {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.payload.exp) {
      return true;
    }

    return decoded.payload.exp < Math.floor(Date.now() / 1000);
  }

  /**
   * Get token expiration time in seconds
   */
  getTokenExpiry(expiry) {
    if (typeof expiry === 'number') {
      return expiry;
    }

    // Convert string expiry to seconds
    const units = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400
    };

    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 3600; // Default to 1 hour
    }

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }

  /**
   * Refresh access token using refresh token
   */
  refreshAccessToken(refreshToken) {
    try {
      const decoded = this.verifyRefreshToken(refreshToken);
      
      // Generate new access token with same payload
      const newAccessToken = this.generateAccessToken({
        openId: decoded.openId,
        userId: decoded.userId,
        role: decoded.role
      });

      return {
        accessToken: newAccessToken,
        expiresIn: this.getTokenExpiry(this.accessTokenExpiry),
        tokenType: 'Bearer'
      };
    } catch (error) {
      throw new TokenError('Failed to refresh token: ' + error.message, 'REFRESH_FAILED');
    }
  }

  /**
   * Blacklist a token (logout)
   */
  blacklistToken(token) {
    if (!token) {
      return false;
    }

    this.blacklistedTokens.add(token);
    
    // Clean up expired tokens periodically (basic implementation)
    if (this.blacklistedTokens.size > 10000) {
      this.cleanupBlacklist();
    }

    return true;
  }

  /**
   * Clean up expired tokens from blacklist
   */
  cleanupBlacklist() {
    const tokensToRemove = [];
    
    for (const token of this.blacklistedTokens) {
      if (this.isTokenExpired(token)) {
        tokensToRemove.push(token);
      }
    }

    tokensToRemove.forEach(token => {
      this.blacklistedTokens.delete(token);
    });

    console.log(`Cleaned up ${tokensToRemove.length} expired tokens from blacklist`);
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader) {
    if (!authHeader) {
      return null;
    }

    // Format: "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }

  /**
   * Get token information without verification
   */
  getTokenInfo(token) {
    const decoded = this.decodeToken(token);
    if (!decoded) {
      return null;
    }

    const payload = decoded.payload;
    return {
      openId: payload.openId,
      userId: payload.userId,
      role: payload.role,
      type: payload.type,
      issuedAt: new Date(payload.iat * 1000),
      expiresAt: new Date(payload.exp * 1000),
      issuer: payload.iss,
      audience: payload.aud,
      jti: payload.jti,
      isExpired: this.isTokenExpired(token)
    };
  }
}

/**
 * Custom error class for token-related errors
 */
class TokenError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'TokenError';
    this.code = code;
  }

  /**
   * Check if error indicates token expiration
   */
  isExpired() {
    return this.code === 'EXPIRED_TOKEN';
  }

  /**
   * Check if error indicates invalid token
   */
  isInvalid() {
    return ['INVALID_TOKEN', 'INVALID_TOKEN_TYPE', 'MISSING_TOKEN'].includes(this.code);
  }

  /**
   * Check if error indicates revoked token
   */
  isRevoked() {
    return this.code === 'REVOKED_TOKEN';
  }
}

// Create singleton instance
const jwtUtils = new JWTUtils();

module.exports = {
  JWTUtils,
  TokenError,
  jwtUtils
};