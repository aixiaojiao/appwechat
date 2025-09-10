/**
 * Secure Storage Utilities for WeChat Mini-Program
 * Handles encrypted storage of sensitive data like tokens
 */

// Simple encryption key - in production, this should be more complex
const ENCRYPTION_KEY = 'StorySpark2024';

/**
 * Simple XOR encryption for basic token protection
 * @param {string} text - Text to encrypt/decrypt
 * @param {string} key - Encryption key
 * @returns {string} Encrypted/decrypted text
 */
function simpleEncrypt(text, key) {
  if (!text || typeof text !== 'string') return '';
  
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode);
  }
  return btoa(result); // Base64 encode
}

/**
 * Decrypt text encrypted with simpleEncrypt
 * @param {string} encryptedText - Encrypted text
 * @param {string} key - Decryption key
 * @returns {string} Decrypted text
 */
function simpleDecrypt(encryptedText, key) {
  if (!encryptedText || typeof encryptedText !== 'string') return '';
  
  try {
    const decodedText = atob(encryptedText); // Base64 decode
    let result = '';
    for (let i = 0; i < decodedText.length; i++) {
      const charCode = decodedText.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  } catch (error) {
    console.error('Decryption failed:', error);
    return '';
  }
}

/**
 * Store data in WeChat storage
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 * @returns {boolean} Success status
 */
function set(key, value) {
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (error) {
    console.error('Storage set error:', error);
    return false;
  }
}

/**
 * Get data from WeChat storage
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if key doesn't exist
 * @returns {*} Stored value or default value
 */
function get(key, defaultValue = null) {
  try {
    const value = wx.getStorageSync(key);
    return value !== '' ? value : defaultValue;
  } catch (error) {
    console.error('Storage get error:', error);
    return defaultValue;
  }
}

/**
 * Store sensitive data with encryption
 * @param {string} key - Storage key
 * @param {string} value - Value to store (must be string)
 * @returns {boolean} Success status
 */
function setSecure(key, value) {
  if (!value || typeof value !== 'string') {
    console.error('setSecure: value must be a non-empty string');
    return false;
  }

  try {
    const encryptedValue = simpleEncrypt(value, ENCRYPTION_KEY);
    const secureKey = `secure_${key}`;
    wx.setStorageSync(secureKey, {
      encrypted: true,
      data: encryptedValue,
      timestamp: Date.now()
    });
    return true;
  } catch (error) {
    console.error('Secure storage set error:', error);
    return false;
  }
}

/**
 * Get sensitive data with decryption
 * @param {string} key - Storage key
 * @returns {string|null} Decrypted value or null
 */
function getSecure(key) {
  try {
    const secureKey = `secure_${key}`;
    const storedData = wx.getStorageSync(secureKey);
    
    if (!storedData || !storedData.encrypted) {
      return null;
    }

    const decryptedValue = simpleDecrypt(storedData.data, ENCRYPTION_KEY);
    return decryptedValue || null;
  } catch (error) {
    console.error('Secure storage get error:', error);
    return null;
  }
}

/**
 * Remove data from storage
 * @param {string} key - Storage key
 * @returns {boolean} Success status
 */
function remove(key) {
  try {
    // Try to remove both regular and secure versions
    wx.removeStorageSync(key);
    wx.removeStorageSync(`secure_${key}`);
    return true;
  } catch (error) {
    console.error('Storage remove error:', error);
    return false;
  }
}

/**
 * Clear all storage (use with caution)
 * @returns {boolean} Success status
 */
function clear() {
  try {
    wx.clearStorageSync();
    return true;
  } catch (error) {
    console.error('Storage clear error:', error);
    return false;
  }
}

/**
 * Get storage info
 * @returns {Object} Storage information
 */
function getInfo() {
  try {
    return wx.getStorageInfoSync();
  } catch (error) {
    console.error('Storage info error:', error);
    return {
      keys: [],
      currentSize: 0,
      limitSize: 0
    };
  }
}

/**
 * Check if a key exists in storage
 * @param {string} key - Storage key
 * @returns {boolean} Whether key exists
 */
function has(key) {
  try {
    const value = wx.getStorageSync(key);
    return value !== '';
  } catch (error) {
    return false;
  }
}

/**
 * Check if a secure key exists in storage
 * @param {string} key - Storage key
 * @returns {boolean} Whether secure key exists
 */
function hasSecure(key) {
  return has(`secure_${key}`);
}

/**
 * Get all keys in storage
 * @returns {Array<string>} Array of storage keys
 */
function keys() {
  try {
    return wx.getStorageInfoSync().keys || [];
  } catch (error) {
    console.error('Storage keys error:', error);
    return [];
  }
}

/**
 * Cleanup expired secure storage entries
 * @param {number} maxAge - Maximum age in milliseconds
 * @returns {number} Number of cleaned entries
 */
function cleanupExpired(maxAge = 30 * 24 * 60 * 60 * 1000) { // Default 30 days
  try {
    const allKeys = keys();
    const secureKeys = allKeys.filter(key => key.startsWith('secure_'));
    const now = Date.now();
    let cleanedCount = 0;

    secureKeys.forEach(secureKey => {
      try {
        const storedData = wx.getStorageSync(secureKey);
        if (storedData && storedData.timestamp) {
          if (now - storedData.timestamp > maxAge) {
            wx.removeStorageSync(secureKey);
            cleanedCount++;
          }
        } else {
          // Remove entries without timestamp (old format)
          wx.removeStorageSync(secureKey);
          cleanedCount++;
        }
      } catch (error) {
        console.warn('Error cleaning key:', secureKey, error);
      }
    });

    console.log(`Cleaned up ${cleanedCount} expired storage entries`);
    return cleanedCount;
  } catch (error) {
    console.error('Cleanup error:', error);
    return 0;
  }
}

/**
 * Batch operations for better performance
 */
const batch = {
  /**
   * Set multiple key-value pairs
   * @param {Object} data - Key-value pairs to set
   * @returns {boolean} Success status
   */
  set(data) {
    try {
      Object.entries(data).forEach(([key, value]) => {
        wx.setStorageSync(key, value);
      });
      return true;
    } catch (error) {
      console.error('Batch set error:', error);
      return false;
    }
  },

  /**
   * Get multiple keys
   * @param {Array<string>} keys - Keys to retrieve
   * @returns {Object} Key-value pairs
   */
  get(keys) {
    const result = {};
    keys.forEach(key => {
      try {
        result[key] = wx.getStorageSync(key);
      } catch (error) {
        console.error(`Batch get error for key ${key}:`, error);
        result[key] = null;
      }
    });
    return result;
  },

  /**
   * Remove multiple keys
   * @param {Array<string>} keys - Keys to remove
   * @returns {boolean} Success status
   */
  remove(keys) {
    try {
      keys.forEach(key => {
        wx.removeStorageSync(key);
        wx.removeStorageSync(`secure_${key}`);
      });
      return true;
    } catch (error) {
      console.error('Batch remove error:', error);
      return false;
    }
  }
};

/**
 * Migrate old storage format to new format (for app updates)
 * @returns {boolean} Migration success status
 */
function migrate() {
  try {
    // Migration logic for different storage format versions
    // This is placeholder for future migrations
    console.log('Storage migration completed');
    return true;
  } catch (error) {
    console.error('Storage migration error:', error);
    return false;
  }
}

module.exports = {
  set,
  get,
  setSecure,
  getSecure,
  remove,
  clear,
  getInfo,
  has,
  hasSecure,
  keys,
  cleanupExpired,
  migrate,
  batch
};