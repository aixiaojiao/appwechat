/**
 * API Utilities with Authentication Support
 * Handles HTTP requests with automatic token management
 */

const storage = require('./storage.js');

// API Configuration
const CONFIG = {
  baseURL: 'https://your-api-domain.com/api', // Update with your actual API domain
  timeout: 10000,
  retryAttempts: 2,
  retryDelay: 1000
};

// Request/Response interceptors
let requestInterceptors = [];
let responseInterceptors = [];

/**
 * Main request function with authentication support
 * @param {Object} options - Request options
 * @returns {Promise<Object>} Request response
 */
function request(options = {}) {
  return new Promise((resolve, reject) => {
    // Merge default options
    const requestOptions = {
      method: 'GET',
      timeout: CONFIG.timeout,
      ...options,
      url: getFullURL(options.url),
      header: {
        'Content-Type': 'application/json',
        ...options.header
      }
    };

    // Apply request interceptors
    let finalOptions = requestOptions;
    requestInterceptors.forEach(interceptor => {
      finalOptions = interceptor(finalOptions);
    });

    // Make the request
    wx.request({
      ...finalOptions,
      success: (response) => {
        // Apply response interceptors
        let finalResponse = response;
        responseInterceptors.forEach(interceptor => {
          finalResponse = interceptor(finalResponse);
        });

        handleResponse(finalResponse, resolve, reject, finalOptions);
      },
      fail: (error) => {
        handleRequestError(error, reject, finalOptions, resolve);
      }
    });
  });
}

/**
 * Handle successful response
 * @param {Object} response - WeChat request response
 * @param {Function} resolve - Promise resolve
 * @param {Function} reject - Promise reject
 * @param {Object} originalOptions - Original request options
 */
function handleResponse(response, resolve, reject, originalOptions) {
  const { statusCode, data } = response;

  // Handle HTTP status codes
  if (statusCode >= 200 && statusCode < 300) {
    resolve(data);
  } else if (statusCode === 401) {
    // Token expired or invalid
    handleAuthenticationError(originalOptions, resolve, reject);
  } else if (statusCode === 403) {
    // Forbidden - user doesn't have permission
    reject(new Error('没有访问权限'));
  } else if (statusCode >= 500) {
    // Server error
    reject(new Error('服务器错误，请稍后重试'));
  } else {
    // Other client errors
    reject(new Error(data.message || `请求失败 (${statusCode})`));
  }
}

/**
 * Handle request failure (network error, timeout, etc.)
 * @param {Object} error - Request error
 * @param {Function} reject - Promise reject
 * @param {Object} originalOptions - Original request options
 * @param {Function} resolve - Promise resolve
 */
function handleRequestError(error, reject, originalOptions, resolve) {
  console.error('Request Error:', error);

  // Retry logic for network errors
  if (originalOptions._retryCount < CONFIG.retryAttempts) {
    setTimeout(() => {
      const retryOptions = {
        ...originalOptions,
        _retryCount: (originalOptions._retryCount || 0) + 1
      };
      
      request(retryOptions).then(resolve).catch(reject);
    }, CONFIG.retryDelay);
  } else {
    reject(new Error('网络请求失败，请检查网络连接'));
  }
}

/**
 * Handle 401 authentication errors
 * @param {Object} originalOptions - Original request options
 * @param {Function} resolve - Promise resolve
 * @param {Function} reject - Promise reject
 */
async function handleAuthenticationError(originalOptions, resolve, reject) {
  // Avoid infinite loops for auth endpoints
  if (originalOptions.url.includes('/auth/')) {
    reject(new Error('身份验证失败'));
    return;
  }

  try {
    // Try to refresh token
    const auth = require('./auth.js');
    
    if (auth.getRefreshToken()) {
      await auth.refreshToken();
      
      // Retry original request with new token
      const newToken = auth.getAccessToken();
      if (newToken) {
        const retryOptions = {
          ...originalOptions,
          header: {
            ...originalOptions.header,
            'Authorization': `Bearer ${newToken}`
          }
        };
        
        const response = await request(retryOptions);
        resolve(response);
        return;
      }
    }

    // If refresh fails, redirect to login
    reject(new Error('请重新登录'));
    
    // Optionally trigger logout
    setTimeout(() => {
      const app = getApp();
      if (app.globalData) {
        app.globalData.needsLogin = true;
      }
    }, 100);

  } catch (refreshError) {
    console.error('Token refresh failed:', refreshError);
    reject(new Error('登录已过期，请重新登录'));
  }
}

/**
 * Get full URL by combining base URL and path
 * @param {string} url - Request URL path
 * @returns {string} Full URL
 */
function getFullURL(url) {
  if (!url) return CONFIG.baseURL;
  
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  const path = url.startsWith('/') ? url : `/${url}`;
  return CONFIG.baseURL + path;
}

/**
 * GET request helper
 * @param {string} url - Request URL
 * @param {Object} params - Query parameters
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Response data
 */
function get(url, params = {}, options = {}) {
  const queryString = Object.keys(params).length > 0 
    ? '?' + Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`).join('&')
    : '';
  
  return request({
    url: url + queryString,
    method: 'GET',
    ...options
  });
}

/**
 * POST request helper
 * @param {string} url - Request URL
 * @param {Object} data - Request body data
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Response data
 */
function post(url, data = {}, options = {}) {
  return request({
    url,
    method: 'POST',
    data,
    ...options
  });
}

/**
 * PUT request helper
 * @param {string} url - Request URL
 * @param {Object} data - Request body data
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Response data
 */
function put(url, data = {}, options = {}) {
  return request({
    url,
    method: 'PUT',
    data,
    ...options
  });
}

/**
 * DELETE request helper
 * @param {string} url - Request URL
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Response data
 */
function del(url, options = {}) {
  return request({
    url,
    method: 'DELETE',
    ...options
  });
}

/**
 * Upload file helper
 * @param {string} url - Upload URL
 * @param {string} filePath - Local file path
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload response
 */
function uploadFile(url, filePath, options = {}) {
  return new Promise((resolve, reject) => {
    const auth = require('./auth.js');
    const token = auth.getAccessToken();
    
    wx.uploadFile({
      url: getFullURL(url),
      filePath,
      name: options.name || 'file',
      formData: options.formData || {},
      header: {
        'Authorization': token ? `Bearer ${token}` : '',
        ...options.header
      },
      success: (response) => {
        if (response.statusCode === 200) {
          try {
            const data = JSON.parse(response.data);
            resolve(data);
          } catch (error) {
            resolve(response.data);
          }
        } else {
          reject(new Error(`上传失败 (${response.statusCode})`));
        }
      },
      fail: (error) => {
        reject(new Error('文件上传失败'));
      }
    });
  });
}

/**
 * Download file helper
 * @param {string} url - Download URL
 * @param {Object} options - Download options
 * @returns {Promise<Object>} Download response
 */
function downloadFile(url, options = {}) {
  return new Promise((resolve, reject) => {
    const auth = require('./auth.js');
    const token = auth.getAccessToken();
    
    wx.downloadFile({
      url: getFullURL(url),
      header: {
        'Authorization': token ? `Bearer ${token}` : '',
        ...options.header
      },
      success: (response) => {
        if (response.statusCode === 200) {
          resolve(response);
        } else {
          reject(new Error(`下载失败 (${response.statusCode})`));
        }
      },
      fail: (error) => {
        reject(new Error('文件下载失败'));
      }
    });
  });
}

/**
 * Add request interceptor
 * @param {Function} interceptor - Interceptor function
 */
function addRequestInterceptor(interceptor) {
  if (typeof interceptor === 'function') {
    requestInterceptors.push(interceptor);
  }
}

/**
 * Add response interceptor
 * @param {Function} interceptor - Interceptor function
 */
function addResponseInterceptor(interceptor) {
  if (typeof interceptor === 'function') {
    responseInterceptors.push(interceptor);
  }
}

/**
 * Remove request interceptor
 * @param {Function} interceptor - Interceptor function to remove
 */
function removeRequestInterceptor(interceptor) {
  const index = requestInterceptors.indexOf(interceptor);
  if (index > -1) {
    requestInterceptors.splice(index, 1);
  }
}

/**
 * Remove response interceptor
 * @param {Function} interceptor - Interceptor function to remove
 */
function removeResponseInterceptor(interceptor) {
  const index = responseInterceptors.indexOf(interceptor);
  if (index > -1) {
    responseInterceptors.splice(index, 1);
  }
}

/**
 * Set API base URL
 * @param {string} baseURL - New base URL
 */
function setBaseURL(baseURL) {
  CONFIG.baseURL = baseURL;
}

/**
 * Get current API base URL
 * @returns {string} Current base URL
 */
function getBaseURL() {
  return CONFIG.baseURL;
}

// Add default auth interceptor
addRequestInterceptor((options) => {
  const auth = require('./auth.js');
  const token = auth.getAccessToken();
  
  if (token && !options.header.Authorization) {
    options.header.Authorization = `Bearer ${token}`;
  }
  
  return options;
});

// Add default response interceptor for logging
addResponseInterceptor((response) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('API Response:', response);
  }
  return response;
});

module.exports = {
  request,
  get,
  post,
  put,
  delete: del,
  uploadFile,
  downloadFile,
  addRequestInterceptor,
  addResponseInterceptor,
  removeRequestInterceptor,
  removeResponseInterceptor,
  setBaseURL,
  getBaseURL,
  CONFIG
};