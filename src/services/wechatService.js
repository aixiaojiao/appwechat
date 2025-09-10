const axios = require('axios');

/**
 * WeChat Mini-Program API Service
 * Handles WeChat OAuth integration and user data retrieval
 */
class WeChatService {
  constructor() {
    this.baseURL = 'https://api.weixin.qq.com/sns';
    this.timeout = 10000; // 10 seconds timeout
  }

  /**
   * Exchange authorization code for session key and openid
   * This is the core OAuth flow for WeChat Mini-Programs
   */
  async code2Session(code, appId, appSecret) {
    if (!code || !appId || !appSecret) {
      throw new Error('Missing required parameters: code, appId, and appSecret are required');
    }

    try {
      const response = await axios.get(`${this.baseURL}/jscode2session`, {
        params: {
          appid: appId,
          secret: appSecret,
          js_code: code,
          grant_type: 'authorization_code'
        },
        timeout: this.timeout,
        headers: {
          'User-Agent': 'StorySpark/1.0'
        }
      });

      const data = response.data;

      // Check for WeChat API errors
      if (data.errcode) {
        throw new WeChatAPIError(data.errcode, data.errmsg || 'Unknown WeChat API error');
      }

      // Validate response structure
      if (!data.openid) {
        throw new Error('Invalid response from WeChat API: missing openid');
      }

      return {
        openid: data.openid,
        sessionKey: data.session_key,
        unionid: data.unionid // Optional, only available if user is bound to WeChat Open Platform
      };
    } catch (error) {
      if (error instanceof WeChatAPIError) {
        throw error;
      }

      // Handle network and other errors
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new Error('Failed to connect to WeChat API service');
      }

      if (error.code === 'ETIMEDOUT') {
        throw new Error('WeChat API request timeout');
      }

      // Log the actual error for debugging but don't expose internal details
      console.error('WeChat API error:', error.message);
      throw new Error('Failed to authenticate with WeChat');
    }
  }

  /**
   * Validate WeChat authorization code format
   */
  static validateAuthCode(code) {
    if (!code || typeof code !== 'string') {
      return false;
    }

    // WeChat auth codes are typically 32 characters long, alphanumeric
    return /^[a-zA-Z0-9]{20,40}$/.test(code);
  }

  /**
   * Validate WeChat App ID format
   */
  static validateAppId(appId) {
    if (!appId || typeof appId !== 'string') {
      return false;
    }

    // WeChat App IDs start with 'wx' followed by 16 hex characters
    return /^wx[a-fA-F0-9]{16}$/.test(appId);
  }

  /**
   * Get user profile information (requires additional permissions)
   * Note: This is not typically used in Mini-Programs as they have limited access
   */
  async getUserInfo(accessToken, openid) {
    if (!accessToken || !openid) {
      throw new Error('Missing required parameters: accessToken and openid are required');
    }

    try {
      const response = await axios.get(`${this.baseURL}/userinfo`, {
        params: {
          access_token: accessToken,
          openid: openid,
          lang: 'zh_CN'
        },
        timeout: this.timeout,
        headers: {
          'User-Agent': 'StorySpark/1.0'
        }
      });

      const data = response.data;

      if (data.errcode) {
        throw new WeChatAPIError(data.errcode, data.errmsg || 'Unknown WeChat API error');
      }

      return {
        openid: data.openid,
        nickname: data.nickname,
        sex: data.sex,
        province: data.province,
        city: data.city,
        country: data.country,
        headimgurl: data.headimgurl,
        privilege: data.privilege,
        unionid: data.unionid
      };
    } catch (error) {
      if (error instanceof WeChatAPIError) {
        throw error;
      }

      console.error('WeChat getUserInfo error:', error.message);
      throw new Error('Failed to get user info from WeChat');
    }
  }

  /**
   * Rate limiting check - simple in-memory implementation
   * In production, use Redis or similar distributed cache
   */
  static checkRateLimit(identifier, maxRequests = 60, windowMs = 60000) {
    if (!this.rateLimitStore) {
      this.rateLimitStore = new Map();
    }

    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    for (const [key, requests] of this.rateLimitStore.entries()) {
      const validRequests = requests.filter(timestamp => timestamp > windowStart);
      if (validRequests.length === 0) {
        this.rateLimitStore.delete(key);
      } else {
        this.rateLimitStore.set(key, validRequests);
      }
    }

    // Check current requests
    const currentRequests = this.rateLimitStore.get(identifier) || [];
    const recentRequests = currentRequests.filter(timestamp => timestamp > windowStart);

    if (recentRequests.length >= maxRequests) {
      return false;
    }

    // Add current request
    recentRequests.push(now);
    this.rateLimitStore.set(identifier, recentRequests);
    return true;
  }
}

/**
 * Custom error class for WeChat API errors
 */
class WeChatAPIError extends Error {
  constructor(errcode, errmsg) {
    super(errmsg);
    this.name = 'WeChatAPIError';
    this.errcode = errcode;
    this.errmsg = errmsg;
  }

  /**
   * Get user-friendly error message based on error code
   */
  getUserFriendlyMessage() {
    const errorMessages = {
      40013: 'Invalid WeChat App ID',
      40029: 'Invalid authorization code',
      45011: 'API call frequency limit exceeded',
      40226: 'High risk user, authorization code is invalid',
      '-1': 'WeChat system error, please try again later'
    };

    return errorMessages[this.errcode] || 'WeChat authentication failed';
  }

  /**
   * Check if error is retryable
   */
  isRetryable() {
    const retryableErrors = ['-1', -1, 45011]; // System error, frequency limit
    return retryableErrors.includes(this.errcode);
  }
}

module.exports = {
  WeChatService,
  WeChatAPIError
};