const { Pool } = require('pg');
require('dotenv').config();

/**
 * Database Connection Configuration
 * Provides connection pooling and environment-specific configurations
 */
class DatabaseConnection {
    constructor() {
        this.pools = new Map();
        this.defaultConfig = this.getConfig();
        this.testConfig = this.getTestConfig();
    }

    /**
     * Get database configuration for current environment
     */
    getConfig(environment = process.env.NODE_ENV || 'development') {
        const baseConfig = {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres',
            max: 20,                    // Maximum number of clients in the pool
            min: 2,                     // Minimum number of clients in the pool
            idleTimeoutMillis: 30000,   // How long a client is allowed to remain idle
            connectionTimeoutMillis: 2000, // How long to wait when connecting
            acquireTimeoutMillis: 60000,    // How long to wait to acquire a connection
            ssl: false
        };

        switch (environment) {
            case 'test':
                return {
                    ...baseConfig,
                    database: (process.env.DB_NAME || 'storyspark') + '_test',
                    max: 5,
                    min: 1
                };
            case 'production':
                return {
                    ...baseConfig,
                    database: process.env.DB_NAME || 'storyspark',
                    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
                    max: 30,
                    min: 5
                };
            default:
                return {
                    ...baseConfig,
                    database: process.env.DB_NAME || 'storyspark'
                };
        }
    }

    /**
     * Get test-specific configuration
     */
    getTestConfig() {
        return this.getConfig('test');
    }

    /**
     * Get or create a connection pool for the specified environment
     */
    getPool(environment = process.env.NODE_ENV || 'development') {
        if (!this.pools.has(environment)) {
            const config = this.getConfig(environment);
            const pool = new Pool(config);

            // Handle pool errors
            pool.on('error', (err) => {
                console.error(`Database pool error (${environment}):`, err);
            });

            // Handle client connections
            pool.on('connect', (client) => {
                // Set up client query event logging in development
                if (environment === 'development' && process.env.LOG_QUERIES === 'true') {
                    client.on('query', (query) => {
                        console.log(`Query: ${query.text}`);
                    });
                }
            });

            this.pools.set(environment, pool);
        }

        return this.pools.get(environment);
    }

    /**
     * Get the default pool for the current environment
     */
    getDefaultPool() {
        return this.getPool();
    }

    /**
     * Get the test pool
     */
    getTestPool() {
        return this.getPool('test');
    }

    /**
     * Test database connection
     */
    async testConnection(environment = process.env.NODE_ENV || 'development') {
        const pool = this.getPool(environment);
        
        try {
            const client = await pool.connect();
            const result = await client.query('SELECT NOW() as current_time, version()');
            client.release();
            
            return {
                success: true,
                timestamp: result.rows[0].current_time,
                version: result.rows[0].version
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Execute a query with automatic connection management
     */
    async query(text, params = [], environment = process.env.NODE_ENV || 'development') {
        const pool = this.getPool(environment);
        const start = Date.now();
        
        try {
            const result = await pool.query(text, params);
            const duration = Date.now() - start;
            
            if (process.env.LOG_QUERIES === 'true') {
                console.log(`Query executed in ${duration}ms:`, { text, params });
            }
            
            return result;
        } catch (error) {
            const duration = Date.now() - start;
            console.error(`Query failed after ${duration}ms:`, { text, params, error: error.message });
            throw error;
        }
    }

    /**
     * Get a client from the pool for transaction handling
     */
    async getClient(environment = process.env.NODE_ENV || 'development') {
        const pool = this.getPool(environment);
        return await pool.connect();
    }

    /**
     * Execute a transaction
     */
    async transaction(callback, environment = process.env.NODE_ENV || 'development') {
        const client = await this.getClient(environment);
        
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Close all connection pools
     */
    async closeAll() {
        const closePromises = [];
        
        for (const [environment, pool] of this.pools.entries()) {
            console.log(`Closing database pool for environment: ${environment}`);
            closePromises.push(pool.end());
        }
        
        await Promise.all(closePromises);
        this.pools.clear();
    }

    /**
     * Close a specific environment pool
     */
    async close(environment = process.env.NODE_ENV || 'development') {
        if (this.pools.has(environment)) {
            const pool = this.pools.get(environment);
            await pool.end();
            this.pools.delete(environment);
        }
    }

    /**
     * Get pool status information
     */
    getPoolStatus(environment = process.env.NODE_ENV || 'development') {
        const pool = this.pools.get(environment);
        
        if (!pool) {
            return { environment, status: 'not_initialized' };
        }

        return {
            environment,
            status: 'active',
            totalCount: pool.totalCount,
            idleCount: pool.idleCount,
            waitingCount: pool.waitingCount
        };
    }

    /**
     * Get status of all pools
     */
    getAllPoolsStatus() {
        const status = [];
        
        for (const environment of this.pools.keys()) {
            status.push(this.getPoolStatus(environment));
        }
        
        return status;
    }
}

// Create and export singleton instance
const dbConnection = new DatabaseConnection();

// Graceful shutdown handling
process.on('SIGINT', async () => {
    console.log('Received SIGINT, closing database connections...');
    await dbConnection.closeAll();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, closing database connections...');
    await dbConnection.closeAll();
    process.exit(0);
});

module.exports = dbConnection;