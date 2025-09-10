const BaseModel = require('./BaseModel');
const { URL } = require('url');

/**
 * User model for StorySpark WeChat mini-program
 * Handles WeChat OpenID authentication and user profile management
 */
class User extends BaseModel {
  constructor(data = {}) {
    super(data);
    
    // Set default values specific to User
    if (!data.created_at) {
      this.data.last_login = null;
    }
  }

  /**
   * Get the table name
   */
  static get tableName() {
    return 'users';
  }

  /**
   * Get validation rules
   */
  getValidationRules() {
    return {
      wechat_openid: {
        required: true,
        type: 'string',
        maxLength: 255,
        validate: (value) => {
          // WeChat OpenID validation - typically 28 characters alphanumeric
          if (!/^[a-zA-Z0-9_-]{20,32}$/.test(value)) {
            return 'WeChat OpenID must be 20-32 alphanumeric characters, underscores, or hyphens';
          }
          return null;
        }
      },
      nickname: {
        required: false,
        type: 'string',
        maxLength: 100,
        validate: (value) => {
          // Nickname should not contain special characters that could be harmful
          if (value && !/^[\u4e00-\u9fa5a-zA-Z0-9\s_-]+$/.test(value)) {
            return 'Nickname can only contain Chinese characters, letters, numbers, spaces, underscores, and hyphens';
          }
          return null;
        }
      },
      avatar_url: {
        required: false,
        type: 'string',
        validate: (value) => {
          if (value) {
            try {
              const url = new URL(value);
              // Only allow https URLs for security
              if (url.protocol !== 'https:') {
                return 'Avatar URL must use HTTPS protocol';
              }
              // Check if it's a reasonable image URL
              if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(url.pathname)) {
                return 'Avatar URL must point to an image file (jpg, jpeg, png, gif, webp)';
              }
            } catch (error) {
              return 'Avatar URL must be a valid URL';
            }
          }
          return null;
        }
      }
    };
  }

  /**
   * Find user by WeChat OpenID
   */
  static async findByWechatId(wechatOpenid) {
    if (!wechatOpenid) {
      return null;
    }
    
    const users = await this.findBy({ wechat_openid: wechatOpenid });
    return users.length > 0 ? users[0] : null;
  }

  /**
   * Create or find user by WeChat OpenID
   */
  static async findOrCreateByWechat(wechatData) {
    if (!wechatData.openid) {
      throw new Error('WeChat OpenID is required');
    }

    let user = await this.findByWechatId(wechatData.openid);
    
    if (!user) {
      // Create new user
      user = new User({
        wechat_openid: wechatData.openid,
        nickname: wechatData.nickname,
        avatar_url: wechatData.avatarUrl
      });
      
      await user.save();
    } else {
      // Update existing user profile if data has changed
      let needsUpdate = false;
      
      if (wechatData.nickname && user.get('nickname') !== wechatData.nickname) {
        user.set('nickname', wechatData.nickname);
        needsUpdate = true;
      }
      
      if (wechatData.avatarUrl && user.get('avatar_url') !== wechatData.avatarUrl) {
        user.set('avatar_url', wechatData.avatarUrl);
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await user.save();
      }
    }
    
    return user;
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin() {
    this.set('last_login', new Date().toISOString());
    await this.save();
  }

  /**
   * Get user's devices
   */
  async getDevices() {
    const Device = require('./Device');
    return Device.findByUser(this.data.id);
  }

  /**
   * Get active devices only
   */
  async getActiveDevices() {
    const Device = require('./Device');
    return Device.findBy({ 
      user_id: this.data.id,
      is_active: true 
    });
  }

  /**
   * Register a new device for this user
   */
  async registerDevice(deviceData) {
    const Device = require('./Device');
    
    // Check if device already exists for this user
    const existingDevices = await Device.findBy({
      user_id: this.data.id,
      device_id: deviceData.device_id
    });
    
    if (existingDevices.length > 0) {
      // Update existing device
      const device = existingDevices[0];
      device.set('device_type', deviceData.device_type);
      device.set('os_version', deviceData.os_version);
      device.set('app_version', deviceData.app_version);
      device.set('is_active', true);
      await device.save();
      return device;
    } else {
      // Create new device
      const device = new Device({
        user_id: this.data.id,
        device_id: deviceData.device_id,
        device_type: deviceData.device_type,
        os_version: deviceData.os_version,
        app_version: deviceData.app_version,
        is_active: true
      });
      
      await device.save();
      return device;
    }
  }

  /**
   * Deactivate all devices for this user
   */
  async deactivateAllDevices() {
    const devices = await this.getDevices();
    
    for (const device of devices) {
      device.set('is_active', false);
      await device.save();
    }
    
    return devices.length;
  }

  /**
   * Check if user has been active recently
   */
  isRecentlyActive(daysThreshold = 30) {
    if (!this.data.last_login) {
      return false;
    }
    
    const lastLogin = new Date(this.data.last_login);
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - daysThreshold);
    
    return lastLogin > threshold;
  }

  /**
   * Get user profile for API response
   */
  getProfile() {
    return {
      id: this.data.id,
      nickname: this.data.nickname,
      avatar_url: this.data.avatar_url,
      created_at: this.data.created_at,
      last_login: this.data.last_login
    };
  }

  /**
   * Convert to JSON, excluding sensitive data
   */
  toJSON() {
    return super.toJSON(['wechat_openid']); // Hide WeChat OpenID from JSON output
  }

  /**
   * Get public user data (for sharing with other users)
   */
  getPublicData() {
    return {
      id: this.data.id,
      nickname: this.data.nickname,
      avatar_url: this.data.avatar_url
    };
  }

  /**
   * Validate WeChat OpenID format
   */
  static isValidWechatOpenId(openid) {
    if (!openid || typeof openid !== 'string') {
      return false;
    }
    
    // WeChat OpenID validation pattern
    return /^[a-zA-Z0-9_-]{20,32}$/.test(openid);
  }

  /**
   * Find users by nickname (for search functionality)
   */
  static async searchByNickname(nickname, limit = 10) {
    if (!nickname || nickname.trim().length === 0) {
      return [];
    }
    
    // This would use LIKE or full-text search in real implementation
    const query = `
      SELECT * FROM ${this.tableName} 
      WHERE nickname ILIKE $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;
    
    const result = await this.executeQuery(query, [`%${nickname.trim()}%`, limit]);
    return result.rows.map(row => new this(row));
  }

  /**
   * Get user statistics
   */
  static async getStats() {
    const totalUsers = await this.count();
    const activeUsers = await this.count({ is_active: true });
    
    // Users who logged in within last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentlyActiveQuery = `
      SELECT COUNT(*) as count FROM ${this.tableName}
      WHERE last_login > $1
    `;
    
    const recentResult = await this.executeQuery(recentlyActiveQuery, [thirtyDaysAgo.toISOString()]);
    const recentlyActive = parseInt(recentResult.rows[0].count);
    
    return {
      total: totalUsers,
      active: activeUsers,
      recently_active: recentlyActive
    };
  }
}

module.exports = User;