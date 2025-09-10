const { randomUUID } = require('crypto');
const dbConnection = require('../config/database');

/**
 * BaseModel provides common CRUD operations and validation framework
 * for all models in the StorySpark application.
 */
class BaseModel {
  constructor(data = {}) {
    this.data = {};
    this.errors = {};
    this.validationRules = {};
    this._associations = {};
    
    // Set default values
    this.data.id = data.id || randomUUID();
    this.data.created_at = data.created_at || new Date().toISOString();
    this.data.updated_at = data.updated_at || new Date().toISOString();
    
    // Set other data
    Object.keys(data).forEach(key => {
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        this.data[key] = data[key];
      }
    });
  }

  /**
   * Get the table name for this model
   * Must be implemented by subclasses
   */
  static get tableName() {
    throw new Error('tableName must be implemented by subclasses');
  }

  /**
   * Get validation rules for this model
   * Must be implemented by subclasses
   */
  getValidationRules() {
    return {};
  }

  /**
   * Validate data against defined rules
   */
  validate() {
    this.errors = {};
    const rules = this.getValidationRules();
    
    for (const [field, rule] of Object.entries(rules)) {
      const value = this.data[field];
      
      // Required validation
      if (rule.required && (value === undefined || value === null || value === '')) {
        this.errors[field] = this.errors[field] || [];
        this.errors[field].push(`${field} is required`);
        continue;
      }
      
      // Skip other validations if field is not required and empty
      if (!rule.required && (value === undefined || value === null || value === '')) {
        continue;
      }
      
      // Type validation
      if (rule.type && typeof value !== rule.type) {
        this.errors[field] = this.errors[field] || [];
        this.errors[field].push(`${field} must be of type ${rule.type}`);
      }
      
      // String length validation
      if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
        this.errors[field] = this.errors[field] || [];
        this.errors[field].push(`${field} must be at most ${rule.maxLength} characters`);
      }
      
      // Custom validation function
      if (rule.validate && typeof rule.validate === 'function') {
        const customError = rule.validate(value);
        if (customError) {
          this.errors[field] = this.errors[field] || [];
          this.errors[field].push(customError);
        }
      }
    }
    
    return Object.keys(this.errors).length === 0;
  }

  /**
   * Sanitize input data
   */
  sanitize() {
    Object.keys(this.data).forEach(key => {
      if (typeof this.data[key] === 'string') {
        // Basic HTML entity encoding for XSS prevention
        this.data[key] = this.data[key]
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#x27;')
          .trim();
      }
    });
  }

  /**
   * Check if model is valid
   */
  isValid() {
    return this.validate();
  }

  /**
   * Get validation errors
   */
  getErrors() {
    return this.errors;
  }

  /**
   * Update the updated_at timestamp
   */
  touch() {
    this.data.updated_at = new Date().toISOString();
  }

  /**
   * Convert model to JSON, excluding sensitive fields
   */
  toJSON(excludeFields = []) {
    const json = { ...this.data };
    excludeFields.forEach(field => {
      delete json[field];
    });
    return json;
  }

  /**
   * Get a specific attribute value
   */
  get(field) {
    return this.data[field];
  }

  /**
   * Set a specific attribute value
   */
  set(field, value) {
    this.data[field] = value;
    if (field !== 'updated_at') {
      this.touch();
    }
  }

  /**
   * Execute a prepared statement with error handling
   */
  static async executeQuery(query, params = []) {
    try {
      return await dbConnection.query(query, params);
    } catch (error) {
      console.error('Database query error:', { query, params, error: error.message });
      throw error;
    }
  }

  /**
   * Find a record by ID
   */
  static async findById(id) {
    const query = `SELECT * FROM ${this.tableName} WHERE id = $1`;
    const result = await this.executeQuery(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return new this(result.rows[0]);
  }

  /**
   * Find records by criteria
   */
  static async findBy(criteria) {
    const keys = Object.keys(criteria);
    const values = Object.values(criteria);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(' AND ');
    const whereClause = keys.map((key, index) => `${key} = $${index + 1}`).join(' AND ');
    
    const query = `SELECT * FROM ${this.tableName} WHERE ${whereClause}`;
    const result = await this.executeQuery(query, values);
    
    return result.rows.map(row => new this(row));
  }

  /**
   * Find all records
   */
  static async findAll() {
    const query = `SELECT * FROM ${this.tableName} ORDER BY created_at DESC`;
    const result = await this.executeQuery(query);
    
    return result.rows.map(row => new this(row));
  }

  /**
   * Save the model (insert or update)
   */
  async save() {
    this.sanitize();
    
    if (!this.isValid()) {
      throw new Error(`Validation failed: ${JSON.stringify(this.getErrors())}`);
    }
    
    const exists = await this.constructor.findById(this.data.id);
    
    if (exists) {
      return this.update();
    } else {
      return this.create();
    }
  }

  /**
   * Create a new record
   */
  async create() {
    const fields = Object.keys(this.data);
    const values = Object.values(this.data);
    const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
    
    const query = `
      INSERT INTO ${this.constructor.tableName} (${fields.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;
    
    const result = await this.constructor.executeQuery(query, values);
    
    if (result.rows.length > 0) {
      Object.assign(this.data, result.rows[0]);
    }
    
    return this;
  }

  /**
   * Update an existing record
   */
  async update() {
    this.touch();
    
    const fields = Object.keys(this.data).filter(key => key !== 'id');
    const values = fields.map(key => this.data[key]);
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    
    values.push(this.data.id); // Add id as last parameter
    
    const query = `
      UPDATE ${this.constructor.tableName}
      SET ${setClause}
      WHERE id = $${values.length}
      RETURNING *
    `;
    
    const result = await this.constructor.executeQuery(query, values);
    
    if (result.rows.length > 0) {
      Object.assign(this.data, result.rows[0]);
    }
    
    return this;
  }

  /**
   * Delete the record
   */
  async delete() {
    const query = `DELETE FROM ${this.constructor.tableName} WHERE id = $1`;
    await this.constructor.executeQuery(query, [this.data.id]);
    return true;
  }

  /**
   * Count records
   */
  static async count(criteria = {}) {
    let query = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    let params = [];
    
    if (Object.keys(criteria).length > 0) {
      const keys = Object.keys(criteria);
      const values = Object.values(criteria);
      const whereClause = keys.map((key, index) => `${key} = $${index + 1}`).join(' AND ');
      query += ` WHERE ${whereClause}`;
      params = values;
    }
    
    const result = await this.executeQuery(query, params);
    return parseInt(result.rows[0].count);
  }

  /**
   * Define association with another model
   */
  static hasMany(associatedModel, options = {}) {
    const foreignKey = options.foreignKey || `${this.name.toLowerCase()}_id`;
    
    this.prototype[`get${associatedModel.name}s`] = async function() {
      return associatedModel.findBy({ [foreignKey]: this.data.id });
    };
  }

  /**
   * Define belongs to association
   */
  static belongsTo(associatedModel, options = {}) {
    const foreignKey = options.foreignKey || `${associatedModel.name.toLowerCase()}_id`;
    
    this.prototype[`get${associatedModel.name}`] = async function() {
      if (!this.data[foreignKey]) return null;
      return associatedModel.findById(this.data[foreignKey]);
    };
  }
}

module.exports = BaseModel;