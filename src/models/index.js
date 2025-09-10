/**
 * Models index file for StorySpark WeChat mini-program
 * Exports all models and sets up model associations
 */

const User = require('./User');
const Device = require('./Device');
const BaseModel = require('./BaseModel');

/**
 * Set up model associations
 */
function setupAssociations() {
  // User has many devices
  User.hasMany(Device, { foreignKey: 'user_id' });
  
  // Device belongs to user
  Device.belongsTo(User, { foreignKey: 'user_id' });
}

/**
 * Initialize database connection and models
 * This would typically set up the actual database connection
 */
async function initialize(databaseConfig = {}) {
  try {
    // Setup associations
    setupAssociations();
    
    console.log('Models initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize models:', error);
    throw error;
  }
}

/**
 * Close database connections
 */
async function close() {
  try {
    // In a real implementation, this would close database connection pools
    console.log('Model connections closed');
    return true;
  } catch (error) {
    console.error('Error closing model connections:', error);
    throw error;
  }
}

/**
 * Health check for models and database
 */
async function healthCheck() {
  try {
    // In a real implementation, this would test database connectivity
    // For now, just return a basic health status
    return {
      status: 'healthy',
      models: {
        User: 'loaded',
        Device: 'loaded'
      },
      database: 'connected', // Would be actual status
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get model statistics
 */
async function getModelStats() {
  try {
    const userStats = await User.getStats();
    const deviceStats = await Device.getStats();
    
    return {
      users: userStats,
      devices: deviceStats,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting model stats:', error);
    throw error;
  }
}

/**
 * Validate all model configurations
 */
function validateModels() {
  const errors = [];
  
  // Check if models have required static properties
  const models = [User, Device];
  
  models.forEach(Model => {
    if (!Model.tableName) {
      errors.push(`${Model.name} missing tableName`);
    }
    
    // Check if model has basic methods
    const requiredMethods = ['findById', 'findBy', 'findAll', 'count'];
    requiredMethods.forEach(method => {
      if (typeof Model[method] !== 'function') {
        errors.push(`${Model.name} missing method: ${method}`);
      }
    });
    
    // Check instance methods
    const instance = new Model();
    const requiredInstanceMethods = ['save', 'delete', 'validate', 'toJSON'];
    requiredInstanceMethods.forEach(method => {
      if (typeof instance[method] !== 'function') {
        errors.push(`${Model.name} instance missing method: ${method}`);
      }
    });
  });
  
  if (errors.length > 0) {
    throw new Error(`Model validation failed: ${errors.join(', ')}`);
  }
  
  return true;
}

/**
 * Database transaction helper
 * In a real implementation, this would use the actual database driver's transaction API
 */
async function transaction(callback) {
  // This is a placeholder for actual transaction implementation
  console.log('Starting transaction...');
  
  try {
    const result = await callback();
    console.log('Transaction committed');
    return result;
  } catch (error) {
    console.log('Transaction rolled back:', error.message);
    throw error;
  }
}

/**
 * Batch operations helper
 */
class BatchOperations {
  constructor() {
    this.operations = [];
  }
  
  add(operation) {
    this.operations.push(operation);
  }
  
  async execute() {
    const results = [];
    
    for (const operation of this.operations) {
      try {
        const result = await operation();
        results.push({ success: true, result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    
    return results;
  }
  
  clear() {
    this.operations = [];
  }
}

/**
 * Export all models and utilities
 */
module.exports = {
  // Models
  User,
  Device,
  BaseModel,
  
  // Utilities
  initialize,
  close,
  healthCheck,
  getModelStats,
  validateModels,
  transaction,
  BatchOperations,
  setupAssociations,
  
  // Model registry for dynamic access
  models: {
    User,
    Device
  },
  
  // Constants
  MODEL_NAMES: ['User', 'Device'],
  VERSION: '1.0.0'
};