/**
 * WeChat OAuth Authentication Utilities
 * Handles complete WeChat login flow and token management
 */

const storage = require('./storage.js');
const api = require('./api.js');

// Constants
const AUTH_STORAGE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_INFO: 'user_info',
  TOKEN_EXPIRES: 'token_expires'
};

const AUTH_STATES = {
  IDLE: 'idle',
  LOGGING_IN: 'logging_in',
  GETTING_PROFILE: 'getting_profile',
  REFRESHING: 'refreshing'
};

let currentAuthState = AUTH_STATES.IDLE;

/**
 * Performs complete WeChat OAuth login flow
 * @param {Object} options - Login options
 * @param {Function} options.onProgress - Progress callback (state, message)
 * @returns {Promise<Object>} Login result with user info and tokens
 */
function login(options = {}) {
  return new Promise((resolve, reject) => {
    if (currentAuthState !== AUTH_STATES.IDLE) {
      reject(new Error('Authentication already in progress'));
      return;
    }

    const { onProgress } = options;
    
    currentAuthState = AUTH_STATES.LOGGING_IN;
    onProgress && onProgress(AUTH_STATES.LOGGING_IN, '正在获取授权码...');

    // Step 1: Get WeChat authorization code
    wx.login({
      success: (loginRes) => {
        if (!loginRes.code) {
          currentAuthState = AUTH_STATES.IDLE;
          reject(new Error('获取授权码失败'));
          return;
        }

        onProgress && onProgress(AUTH_STATES.LOGGING_IN, '正在验证身份...');

        // Step 2: Send auth code to backend
        const appId = getApp().globalData.appId || '';
        
        api.request({
          url: '/auth/wechat',
          method: 'POST',
          data: {
            code: loginRes.code,
            appId: appId
          }
        }).then((authRes) => {
          if (!authRes.success) {
            throw new Error(authRes.message || '身份验证失败');
          }

          // Step 3: Store tokens securely
          const { token, refreshToken, user, expiresIn } = authRes.data || authRes;
          
          if (!token || !user) {
            throw new Error('服务器返回数据不完整');
          }

          // Calculate expiration time
          const expiresAt = Date.now() + (expiresIn * 1000);
          
          // Store authentication data
          storage.setSecure(AUTH_STORAGE_KEYS.ACCESS_TOKEN, token);
          storage.setSecure(AUTH_STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
          storage.set(AUTH_STORAGE_KEYS.USER_INFO, user);
          storage.set(AUTH_STORAGE_KEYS.TOKEN_EXPIRES, expiresAt);

          currentAuthState = AUTH_STATES.IDLE;
          
          resolve({
            success: true,
            user: user,
            token: token,
            expiresIn: expiresIn
          });

        }).catch((error) => {
          currentAuthState = AUTH_STATES.IDLE;
          console.error('Auth API Error:', error);
          reject(new Error(error.message || '网络请求失败'));
        });

      },
      fail: (error) => {
        currentAuthState = AUTH_STATES.IDLE;
        console.error('WeChat Login Error:', error);
        reject(new Error('微信登录失败'));
      }
    });
  });
}

/**
 * Gets user profile using WeChat getUserProfile API
 * Requires user interaction to call this function
 * @returns {Promise<Object>} User profile data
 */
function getUserProfile() {
  return new Promise((resolve, reject) => {
    if (currentAuthState !== AUTH_STATES.IDLE) {
      reject(new Error('Authentication operation in progress'));
      return;
    }

    currentAuthState = AUTH_STATES.GETTING_PROFILE;

    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (profileRes) => {
        currentAuthState = AUTH_STATES.IDLE;
        resolve({
          nickname: profileRes.userInfo.nickName,
          avatar: profileRes.userInfo.avatarUrl,
          gender: profileRes.userInfo.gender,
          city: profileRes.userInfo.city,
          province: profileRes.userInfo.province,
          country: profileRes.userInfo.country
        });
      },
      fail: (error) => {
        currentAuthState = AUTH_STATES.IDLE;
        console.error('Get User Profile Error:', error);
        reject(new Error('获取用户信息失败'));
      }
    });
  });
}

/**
 * Logout user and clean up all stored authentication data
 * @returns {Promise<boolean>} Success status
 */
function logout() {
  return new Promise((resolve, reject) => {
    try {
      // Clear all authentication data
      storage.remove(AUTH_STORAGE_KEYS.ACCESS_TOKEN);
      storage.remove(AUTH_STORAGE_KEYS.REFRESH_TOKEN);
      storage.remove(AUTH_STORAGE_KEYS.USER_INFO);
      storage.remove(AUTH_STORAGE_KEYS.TOKEN_EXPIRES);

      // Reset auth state
      currentAuthState = AUTH_STATES.IDLE;

      // Optional: Notify backend about logout
      const token = getAccessToken();
      if (token) {
        api.request({
          url: '/auth/logout',
          method: 'POST',
          header: {
            'Authorization': `Bearer ${token}`
          }
        }).catch((error) => {
          // Ignore backend logout errors, user is already logged out locally
          console.warn('Backend logout failed:', error);
        });
      }

      resolve(true);
    } catch (error) {
      console.error('Logout Error:', error);
      reject(new Error('登出失败'));
    }
  });
}

/**
 * Refreshes access token using refresh token
 * @returns {Promise<Object>} New token data
 */
function refreshToken() {
  return new Promise((resolve, reject) => {
    if (currentAuthState === AUTH_STATES.REFRESHING) {
      reject(new Error('Token refresh already in progress'));
      return;
    }

    const refreshTokenValue = getRefreshToken();
    if (!refreshTokenValue) {
      reject(new Error('No refresh token available'));
      return;
    }

    currentAuthState = AUTH_STATES.REFRESHING;

    api.request({
      url: '/auth/refresh',
      method: 'POST',
      data: {
        refreshToken: refreshTokenValue
      }
    }).then((refreshRes) => {
      if (!refreshRes.success) {
        throw new Error(refreshRes.message || 'Token refresh failed');
      }

      const { token, refreshToken: newRefreshToken, expiresIn } = refreshRes.data || refreshRes;
      
      if (!token) {
        throw new Error('Invalid refresh response');
      }

      // Update stored tokens
      const expiresAt = Date.now() + (expiresIn * 1000);
      
      storage.setSecure(AUTH_STORAGE_KEYS.ACCESS_TOKEN, token);
      if (newRefreshToken) {
        storage.setSecure(AUTH_STORAGE_KEYS.REFRESH_TOKEN, newRefreshToken);
      }
      storage.set(AUTH_STORAGE_KEYS.TOKEN_EXPIRES, expiresAt);

      currentAuthState = AUTH_STATES.IDLE;

      resolve({
        token: token,
        refreshToken: newRefreshToken,
        expiresIn: expiresIn
      });

    }).catch((error) => {
      currentAuthState = AUTH_STATES.IDLE;
      console.error('Token Refresh Error:', error);
      reject(new Error('刷新令牌失败'));
    });
  });
}

/**
 * Checks if user is currently authenticated
 * @param {boolean} checkExpiration - Whether to check token expiration
 * @returns {boolean} Authentication status
 */
function isAuthenticated(checkExpiration = true) {
  const token = getAccessToken();
  if (!token) {
    return false;
  }

  if (checkExpiration) {
    const expiresAt = storage.get(AUTH_STORAGE_KEYS.TOKEN_EXPIRES);
    if (expiresAt && Date.now() >= expiresAt) {
      return false;
    }
  }

  return true;
}

/**
 * Gets current access token
 * @returns {string|null} Access token or null
 */
function getAccessToken() {
  return storage.getSecure(AUTH_STORAGE_KEYS.ACCESS_TOKEN);
}

/**
 * Gets current refresh token
 * @returns {string|null} Refresh token or null
 */
function getRefreshToken() {
  return storage.getSecure(AUTH_STORAGE_KEYS.REFRESH_TOKEN);
}

/**
 * Gets stored user information
 * @returns {Object|null} User info or null
 */
function getUserInfo() {
  return storage.get(AUTH_STORAGE_KEYS.USER_INFO);
}

/**
 * Gets current authentication state
 * @returns {string} Current auth state
 */
function getAuthState() {
  return currentAuthState;
}

/**
 * Checks if token is expired or close to expiration
 * @param {number} bufferMinutes - Buffer time in minutes before actual expiration
 * @returns {boolean} Whether token needs refresh
 */
function needsTokenRefresh(bufferMinutes = 5) {
  const expiresAt = storage.get(AUTH_STORAGE_KEYS.TOKEN_EXPIRES);
  if (!expiresAt) {
    return true;
  }

  const bufferTime = bufferMinutes * 60 * 1000; // Convert to milliseconds
  return Date.now() >= (expiresAt - bufferTime);
}

/**
 * Automatically refreshes token if needed
 * @returns {Promise<boolean>} Whether refresh was successful
 */
async function autoRefreshToken() {
  if (!needsTokenRefresh()) {
    return true;
  }

  if (!getRefreshToken()) {
    return false;
  }

  try {
    await refreshToken();
    return true;
  } catch (error) {
    console.error('Auto refresh failed:', error);
    return false;
  }
}

module.exports = {
  login,
  logout,
  getUserProfile,
  refreshToken,
  isAuthenticated,
  getAccessToken,
  getRefreshToken,
  getUserInfo,
  getAuthState,
  needsTokenRefresh,
  autoRefreshToken,
  AUTH_STATES,
  AUTH_STORAGE_KEYS
};