const BaseModel = require('./BaseModel');

/**
 * Device model for StorySpark WeChat mini-program
 * Manages device registration and tracking for users
 */
class Device extends BaseModel {
  constructor(data = {}) {
    super(data);
    
    // Set default values specific to Device
    if (data.is_paired === undefined) {
      this.data.is_paired = false;
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
      device_name: {
        required: true,
        type: 'string',
        maxLength: 255,
        validate: (value) => {
          if (value.length < 2) {
            return 'device_name must be at least 2 characters long';
          }
          return null;
        }
      },
      device_type: {
        required: true,
        type: 'string',
        maxLength: 50,
        validate: (value) => {
          if (value) {
            // Device types for StorySpark BLE speakers
            const validTypes = [
              'speaker', 'ble_speaker', 'smart_speaker', 'story_speaker'
            ];
            if (!validTypes.includes(value.toLowerCase())) {
              return `device_type must be one of: ${validTypes.join(', ')}`;
            }
          }
          return null;
        }
      },
      mac_address: {
        required: false,
        type: 'string',
        validate: (value) => {
          if (value) {
            // MAC address validation
            const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
            if (!macRegex.test(value)) {
              return 'mac_address must be in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX';
            }
          }
          return null;
        }
      },
      pairing_code: {
        required: false,
        type: 'string',
        validate: (value) => {
          if (value && !/^[A-Z0-9]{6}$/.test(value)) {
            return 'pairing_code must be 6 uppercase alphanumeric characters';
          }
          return null;
        }
      },
      is_paired: {
        required: false,
        validate: (value) => {
          if (value !== undefined && typeof value !== 'boolean') {
            return 'is_paired must be a boolean value';
          }
          return null;
        }
      },
      last_seen: {
        required: false,
        type: 'string',
        validate: (value) => {
          if (value && isNaN(Date.parse(value))) {
            return 'last_seen must be a valid ISO 8601 date string';
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
  static async findByUser(userId) {
    if (!userId) {
      return [];
    }
    
    return this.findBy({ user_id: userId });
  }

  /**
   * Find paired devices by user ID
   */
  static async findPairedByUser(userId) {
    if (!userId) {
      return [];
    }
    
    return this.findBy({ 
      user_id: userId,
      is_paired: true 
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
   * Generate a pairing code for BLE device connection
   */
  generatePairingCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.set('pairing_code', code);
    return code;
  }

  /**
   * Mark device as paired
   */
  async markAsPaired() {
    this.set('is_paired', true);
    this.set('pairing_code', null); // Clear pairing code after successful pairing
    this.set('last_seen', new Date().toISOString());
    return this.save();
  }

  /**
   * Mark device as unpaired
   */
  async markAsUnpaired() {
    this.set('is_paired', false);
    this.set('pairing_code', null);
    return this.save();
  }

  /**
   * Check if device is paired
   */
  isPaired() {
    return this.data.is_paired === true;
  }

  /**
   * Update last seen timestamp for BLE connection tracking
   */
  async updateLastSeen() {
    this.set('last_seen', new Date().toISOString());
    return this.save();
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