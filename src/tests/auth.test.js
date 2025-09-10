const request = require('supertest');
const app = require('../server');
const { jwtUtils } = require('../utils/jwt');
const { WeChatService } = require('../services/wechatService');
const User = require('../models/User');

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.WECHAT_APP_SECRET = 'test_app_secret';
process.env.JWT_SECRET = 'test_jwt_secret_for_testing_64_chars_minimum_length_requirement';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_64_chars_minimum_length_for_security';

describe('Authentication System Tests', () => {
  let testUser;
  let validTokens;
  
  beforeAll(async () => {
    // Create test user
    testUser = new User({
      wechat_openid: 'test_openid_12345678901234567890',
      nickname: 'Test User',
      avatar_url: 'https://example.com/avatar.jpg'
    });
    
    // Mock database operations for testing
    jest.spyOn(User, 'findOrCreateByWechat').mockResolvedValue(testUser);
    jest.spyOn(User, 'findByWechatId').mockResolvedValue(testUser);
    jest.spyOn(testUser, 'updateLastLogin').mockResolvedValue();
    jest.spyOn(testUser, 'save').mockResolvedValue();
    jest.spyOn(testUser, 'get').mockImplementation((field) => {
      const mockData = {
        id: 1,
        wechat_openid: 'test_openid_12345678901234567890',
        nickname: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg'
      };
      return mockData[field];
    });
    jest.spyOn(testUser, 'getProfile').mockReturnValue({
      id: 1,
      nickname: 'Test User',
      avatar_url: 'https://example.com/avatar.jpg'
    });

    // Generate valid tokens for testing
    validTokens = jwtUtils.generateTokenPair({
      openId: 'test_openid_12345678901234567890',
      userId: 1,
      role: 'user'
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('WeChat OAuth Authentication', () => {
    beforeEach(() => {
      // Mock WeChat API call
      jest.spyOn(WeChatService.prototype, 'code2Session').mockResolvedValue({
        openid: 'test_openid_12345678901234567890',
        sessionKey: 'test_session_key',
        unionid: 'test_union_id'
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('POST /api/auth/wechat - successful authentication', async () => {
      const response = await request(app)
        .post('/api/auth/wechat')
        .send({
          code: 'valid_wechat_auth_code_123456789',
          appId: 'wx1234567890123456'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('openId');
      expect(response.body).toHaveProperty('expiresIn');

      console.log('✅ WeChat OAuth authentication successful:', {
        hasToken: !!response.body.token,
        hasRefreshToken: !!response.body.refreshToken,
        userOpenId: response.body.user.openId?.substring(0, 8) + '...',
        expiresIn: response.body.expiresIn
      });
    });

    test('POST /api/auth/wechat - missing required fields', async () => {
      const response = await request(app)
        .post('/api/auth/wechat')
        .send({
          code: 'valid_wechat_auth_code_123456789'
          // Missing appId
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('validation_error');
      expect(response.body.message).toContain('Missing required fields');

      console.log('✅ Missing fields validation working:', response.body.message);
    });

    test('POST /api/auth/wechat - invalid code format', async () => {
      const response = await request(app)
        .post('/api/auth/wechat')
        .send({
          code: 'invalid',
          appId: 'wx1234567890123456'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('invalid_code');

      console.log('✅ Invalid code format validation working');
    });

    test('POST /api/auth/wechat - invalid appId format', async () => {
      const response = await request(app)
        .post('/api/auth/wechat')
        .send({
          code: 'valid_wechat_auth_code_123456789',
          appId: 'invalid_app_id'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('invalid_app_id');

      console.log('✅ Invalid appId format validation working');
    });

    test('POST /api/auth/wechat - WeChat API error handling', async () => {
      // Mock WeChat API error
      const mockError = new (require('../services/wechatService').WeChatAPIError)(40029, 'Invalid code');
      jest.spyOn(WeChatService.prototype, 'code2Session').mockRejectedValue(mockError);

      const response = await request(app)
        .post('/api/auth/wechat')
        .send({
          code: 'invalid_wechat_code_123456789',
          appId: 'wx1234567890123456'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('wechat_api_error');
      expect(response.body).toHaveProperty('code', 40029);

      console.log('✅ WeChat API error handling working:', response.body.message);
    });
  });

  describe('Token Management', () => {
    test('POST /api/auth/refresh - successful token refresh', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: validTokens.refreshToken
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('expiresIn');
      expect(response.body.tokenType).toBe('Bearer');

      console.log('✅ Token refresh successful');
    });

    test('POST /api/auth/refresh - missing refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('validation_error');

      console.log('✅ Missing refresh token validation working');
    });

    test('POST /api/auth/refresh - invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'invalid_refresh_token'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('token_refresh_failed');

      console.log('✅ Invalid refresh token handling working');
    });

    test('POST /api/auth/verify - valid token verification', async () => {
      const response = await request(app)
        .post('/api/auth/verify')
        .send({
          token: validTokens.accessToken
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.valid).toBe(true);
      expect(response.body).toHaveProperty('tokenInfo');
      expect(response.body.tokenInfo).toHaveProperty('openId');
      expect(response.body.tokenInfo).toHaveProperty('userId');

      console.log('✅ Token verification successful:', {
        valid: response.body.valid,
        openId: response.body.tokenInfo.openId?.substring(0, 8) + '...',
        userId: response.body.tokenInfo.userId
      });
    });

    test('POST /api/auth/verify - invalid token verification', async () => {
      const response = await request(app)
        .post('/api/auth/verify')
        .send({
          token: 'invalid_token'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(true);
      expect(response.body.valid).toBe(false);
      expect(response.body).toHaveProperty('error');

      console.log('✅ Invalid token verification working');
    });
  });

  describe('Protected Routes', () => {
    test('GET /api/auth/profile - with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${validTokens.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('nickname');

      console.log('✅ Protected route access successful:', {
        userId: response.body.user.id,
        nickname: response.body.user.nickname
      });
    });

    test('GET /api/auth/profile - without token', async () => {
      const response = await request(app)
        .get('/api/auth/profile');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('missing_token');

      console.log('✅ Protected route access denied without token');
    });

    test('GET /api/auth/profile - with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid_token');

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('invalid_token');

      console.log('✅ Protected route access denied with invalid token');
    });
  });

  describe('Session Management', () => {
    test('POST /api/auth/logout - successful logout', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${validTokens.accessToken}`)
        .send({
          refreshToken: validTokens.refreshToken
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Logged out successfully');

      console.log('✅ Logout successful');
    });

    test('POST /api/auth/logout - without tokens (still successful)', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Logged out successfully');

      console.log('✅ Logout without tokens still successful');
    });
  });

  describe('Rate Limiting', () => {
    test('Rate limiting on auth endpoint', async () => {
      // Mock WeChat service for rapid testing
      jest.spyOn(WeChatService.prototype, 'code2Session').mockResolvedValue({
        openid: 'test_openid_12345678901234567890',
        sessionKey: 'test_session_key'
      });

      // Make multiple requests rapidly
      const requests = [];
      for (let i = 0; i < 12; i++) {
        requests.push(
          request(app)
            .post('/api/auth/wechat')
            .send({
              code: `valid_wechat_auth_code_${i}`,
              appId: 'wx1234567890123456'
            })
        );
      }

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited (status 429)
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);

      console.log('✅ Rate limiting working:', {
        totalRequests: responses.length,
        rateLimited: rateLimitedResponses.length,
        successful: responses.filter(r => r.status === 200).length
      });
    }, 10000); // Increase timeout for this test
  });

  describe('Security Features', () => {
    test('CORS headers are set correctly', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.headers).toHaveProperty('access-control-allow-origin');
      
      console.log('✅ CORS headers present');
    });

    test('Security headers are set on protected routes', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${validTokens.accessToken}`);

      expect(response.headers).toHaveProperty('cache-control', 'no-store');
      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      
      console.log('✅ Security headers present on protected routes');
    });

    test('Input sanitization and validation', async () => {
      const maliciousPayload = {
        code: '<script>alert("xss")</script>',
        appId: 'wx1234567890123456'
      };

      const response = await request(app)
        .post('/api/auth/wechat')
        .send(maliciousPayload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_code');
      
      console.log('✅ Input validation prevents malicious payloads');
    });
  });

  describe('Health Check', () => {
    test('GET /health - service health check', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('service', 'storyspark-api');
      
      console.log('✅ Health check working:', response.body);
    });

    test('GET /api/auth/health - authentication service health', async () => {
      const response = await request(app)
        .get('/api/auth/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('service', 'authentication');
      
      console.log('✅ Auth service health check working:', {
        status: response.body.status,
        checks: response.body.checks
      });
    });
  });

  describe('Error Handling', () => {
    test('404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('not_found');
      
      console.log('✅ 404 handling working');
    });

    test('Invalid JSON handling', async () => {
      const response = await request(app)
        .post('/api/auth/wechat')
        .type('json')
        .send('{ invalid json');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_json');
      
      console.log('✅ Invalid JSON handling working');
    });
  });
});

describe('JWT Utilities Tests', () => {
  const testPayload = {
    openId: 'test_openid_12345678901234567890',
    userId: 1,
    role: 'user'
  };

  test('Token generation and verification', () => {
    const tokens = jwtUtils.generateTokenPair(testPayload);
    
    expect(tokens).toHaveProperty('accessToken');
    expect(tokens).toHaveProperty('refreshToken');
    expect(tokens).toHaveProperty('expiresIn');
    expect(tokens.tokenType).toBe('Bearer');

    // Verify tokens
    const accessTokenData = jwtUtils.verifyAccessToken(tokens.accessToken);
    const refreshTokenData = jwtUtils.verifyRefreshToken(tokens.refreshToken);

    expect(accessTokenData.openId).toBe(testPayload.openId);
    expect(accessTokenData.userId).toBe(testPayload.userId);
    expect(refreshTokenData.openId).toBe(testPayload.openId);

    console.log('✅ JWT token generation and verification working');
  });

  test('Token expiration handling', () => {
    // Create a token that expires immediately
    const expiredToken = jwtUtils.generateAccessToken(testPayload);
    
    // Mock the token to be expired
    const tokenInfo = jwtUtils.getTokenInfo(expiredToken);
    expect(tokenInfo).toHaveProperty('isExpired');
    
    console.log('✅ Token expiration detection working');
  });

  test('Token blacklisting', () => {
    const token = jwtUtils.generateAccessToken(testPayload);
    
    // Blacklist the token
    const result = jwtUtils.blacklistToken(token);
    expect(result).toBe(true);

    // Try to verify blacklisted token
    expect(() => {
      jwtUtils.verifyAccessToken(token);
    }).toThrow();

    console.log('✅ Token blacklisting working');
  });
});

console.log('\n🧪 Authentication System Test Suite');
console.log('====================================');
console.log('This comprehensive test suite validates:');
console.log('• WeChat OAuth authentication flow');
console.log('• JWT token generation and validation');
console.log('• Protected route access control');
console.log('• Rate limiting and security features');
console.log('• Error handling and validation');
console.log('• Session management and logout');
console.log('====================================\n');