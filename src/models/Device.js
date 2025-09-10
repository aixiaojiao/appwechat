const BaseModel = require('./BaseModel');

/**
 * Device model for StorySpark WeChat mini-program
 * Manages device registration and tracking for users
 */
class Device extends BaseModel {
  constructor(data = {}) {
    super(data);
    
    // Set default values specific to Device
    if (data.is_active === undefined) {
      this.data.is_active = true;
    }
  }

  /**
   * Get the table name
   */
  static get tableName() {
    return 'devices';
  }

  /**
   * Get validation rules
   */
  getValidationRules() {
    return {
      user_id: {
        required: true,
        type: 'string',
        validate: (value) => {
          // UUID validation
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(value)) {
            return 'user_id must be a valid UUID';
          }
          return null;
        }
      },
      device_id: {
        required: true,
        type: 'string',
        maxLength: 255,
        validate: (value) => {
          // Device ID should be alphanumeric with some special characters
          if (!/^[a-zA-Z0-9_.-]+$/.test(value)) {
            return 'device_id can only contain letters, numbers, underscores, periods, and hyphens';
          }
          if (value.length < 5) {
            return 'device_id must be at least 5 characters long';
          }
          return null;
        }
      },
      device_type: {
        required: false,
        type: 'string',
        maxLength: 50,
        validate: (value) => {
          if (value) {
            // Common device types for WeChat mini-programs
            const validTypes = [
              'ios', 'android', 'windows', 'mac', 'linux',
              'iphone', 'ipad', 'android-phone', 'android-tablet',
              'wechat-devtools', 'unknown'
            ];
            if (!validTypes.includes(value.toLowerCase())) {
              return `device_type must be one of: ${validTypes.join(', ')}`;
            }
          }
          return null;
        }
      },
      os_version: {
        required: false,
        type: 'string',
        maxLength: 50,
        validate: (value) => {
          if (value) {
            // Basic OS version format validation
            if (!/^[\d.]+(\s+\w+)*$/.test(value)) {
              return 'os_version must be in a valid version format (e.g., "14.5", "11.0.1", "10 SP1")';
            }
          }
          return null;
        }
      },
      app_version: {
        required: false,
        type: 'string',
        maxLength: 50,
        validate: (value) => {
          if (value) {
            // Basic app version format validation (semantic versioning)
            if (!/^\d+\.\d+(\.\d+)?(-[\w.]+)?(\+[\w.]+)?$/.test(value)) {
              return 'app_version must be in semantic versioning format (e.g., "1.0.0", "2.1.0-beta", "1.0.0+build.1")';
            }
          }
          return null;
        }
      },
      is_active: {
        required: false,
        validate: (value) => {
          if (value !== undefined && typeof value !== 'boolean') {
            return 'is_active must be a boolean value';
          }
          return null;
        }
      }
    };
  }

  /**
   * Find devices by user ID
   */
  static async findByUserId(userId) {
    if (!userId) {
      return [];
    }
    
    return this.findBy({ user_id: userId });
  }

  /**
   * Find active devices by user ID
   */
  static async findActiveByUserId(userId) {
    if (!userId) {
      return [];
    }
    
    return this.findBy({ 
      user_id: userId,
      is_active: true 
    });
  }

  /**
   * Find device by user ID and device ID
   */
  static async findByUserAndDevice(userId, deviceId) {
    if (!userId || !deviceId) {
      return null;
    }
    
    const devices = await this.findBy({
      user_id: userId,
      device_id: deviceId
    });
    
    return devices.length > 0 ? devices[0] : null;
  }

  /**
   * Register or update a device
   */
  static async registerDevice(userId, deviceData) {
    if (!userId || !deviceData.device_id) {
      throw new Error('User ID and device ID are required');
    }
    
    // Check if device already exists
    let device = await this.findByUserAndDevice(userId, deviceData.device_id);
    
    if (device) {
      // Update existing device
      device.set('device_type', deviceData.device_type);
      device.set('os_version', deviceData.os_version);
      device.set('app_version', deviceData.app_version);
      device.set('is_active', true);
      await device.save();
    } else {
      // Create new device
      device = new Device({
        user_id: userId,
        device_id: deviceData.device_id,
        device_type: deviceData.device_type,
        os_version: deviceData.os_version,
        app_version: deviceData.app_version,
        is_active: true
      });
      
      await device.save();
    }
    
    return device;
  }

  /**
   * Get the user associated with this device
   */
  async getUser() {
    if (!this.data.user_id) {
      return null;
    }
    
    const User = require('./User');
    return User.findById(this.data.user_id);
  }

  /**
   * Deactivate this device
   */
  async deactivate() {
    this.set('is_active', false);
    return this.save();
  }

  /**
   * Activate this device
   */
  async activate() {
    this.set('is_active', true);
    return this.save();
  }

  /**
   * Check if device is active
   */
  isActive() {
    return this.data.is_active === true;
  }

  /**
   * Update device info
   */
  async updateInfo(deviceData) {
    const fieldsToUpdate = ['device_type', 'os_version', 'app_version'];
    let hasChanges = false;
    
    fieldsToUpdate.forEach(field => {
      if (deviceData[field] !== undefined && this.data[field] !== deviceData[field]) {
        this.set(field, deviceData[field]);
        hasChanges = true;
      }
    });
    
    if (hasChanges) {
      await this.save();
    }
    
    return this;
  }

  /**
   * Get device summary for API response
   */
  getSummary() {
    return {
      id: this.data.id,
      device_id: this.data.device_id,
      device_type: this.data.device_type,
      os_version: this.data.os_version,
      app_version: this.data.app_version,
      is_active: this.data.is_active,
      created_at: this.data.created_at,
      updated_at: this.data.updated_at
    };
  }

  /**
   * Find devices by device type
   */
  static async findByDeviceType(deviceType) {
    if (!deviceType) {
      return [];
    }
    
    return this.findBy({ device_type: deviceType });
  }

  /**
   * Find devices by app version
   */
  static async findByAppVersion(appVersion) {
    if (!appVersion) {
      return [];
    }
    
    return this.findBy({ app_version: appVersion });
  }

  /**
   * Get device statistics
   */
  static async getStats() {
    const totalDevices = await this.count();
    const activeDevices = await this.count({ is_active: true });
    
    // Get device type distribution
    const deviceTypeQuery = `
      SELECT device_type, COUNT(*) as count 
      FROM ${this.tableName} 
      WHERE is_active = true 
      GROUP BY device_type 
      ORDER BY count DESC
    `;
    
    const typeResult = await this.executeQuery(deviceTypeQuery);
    const deviceTypeDistribution = typeResult.rows.reduce((acc, row) => {
      acc[row.device_type || 'unknown'] = parseInt(row.count);
      return acc;
    }, {});
    
    // Get app version distribution
    const appVersionQuery = `
      SELECT app_version, COUNT(*) as count 
      FROM ${this.tableName} 
      WHERE is_active = true AND app_version IS NOT NULL
      GROUP BY app_version 
      ORDER BY count DESC
      LIMIT 10
    `;
    
    const versionResult = await this.executeQuery(appVersionQuery);
    const appVersionDistribution = versionResult.rows.reduce((acc, row) => {
      acc[row.app_version] = parseInt(row.count);
      return acc;
    }, {});
    
    return {
      total: totalDevices,
      active: activeDevices,
      device_types: deviceTypeDistribution,
      app_versions: appVersionDistribution
    };
  }

  /**
   * Clean up inactive devices older than specified days
   */
  static async cleanupInactiveDevices(daysOld = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const query = `
      DELETE FROM ${this.tableName}
      WHERE is_active = false 
      AND updated_at < $1
    `;
    
    const result = await this.executeQuery(query, [cutoffDate.toISOString()]);
    return result.rowCount;
  }

  /**
   * Validate device uniqueness per user
   */
  async validateDeviceUniqueness() {
    if (!this.data.user_id || !this.data.device_id) {
      return true; // Will be caught by required validation
    }
    
    const existingDevices = await this.constructor.findBy({
      user_id: this.data.user_id,
      device_id: this.data.device_id
    });
    
    // Allow if it's the same device (update case)
    return existingDevices.length === 0 || 
           (existingDevices.length === 1 && existingDevices[0].data.id === this.data.id);
  }

  /**
   * Override save to include uniqueness validation
   */
  async save() {
    const isUnique = await this.validateDeviceUniqueness();
    if (!isUnique) {
      throw new Error('Device ID must be unique per user');
    }
    
    return super.save();
  }
}

module.exports = Device;