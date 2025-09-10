#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

/**
 * Database Migration Framework
 * Provides up/down migration capabilities with status tracking
 */
class MigrationRunner {
    constructor() {
        this.pool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            database: process.env.DB_NAME || 'storyspark',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres',
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        this.migrationsDir = path.join(__dirname, '../migrations');
        this.migrationsTable = 'schema_migrations';
    }

    /**
     * Initialize the migrations tracking table
     */
    async initializeMigrationsTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
                id SERIAL PRIMARY KEY,
                version VARCHAR(255) NOT NULL UNIQUE,
                executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `;

        try {
            await this.pool.query(query);
            console.log('Migration tracking table initialized');
        } catch (error) {
            console.error('Error initializing migrations table:', error);
            throw error;
        }
    }

    /**
     * Get list of executed migrations
     */
    async getExecutedMigrations() {
        await this.initializeMigrationsTable();
        
        const query = `SELECT version FROM ${this.migrationsTable} ORDER BY version`;
        const result = await this.pool.query(query);
        return result.rows.map(row => row.version);
    }

    /**
     * Get list of available migration files
     */
    getAvailableMigrations() {
        if (!fs.existsSync(this.migrationsDir)) {
            return [];
        }

        return fs.readdirSync(this.migrationsDir)
            .filter(file => file.endsWith('.js'))
            .map(file => file.replace('.js', ''))
            .sort();
    }

    /**
     * Get pending migrations that haven't been executed
     */
    async getPendingMigrations() {
        const executed = await this.getExecutedMigrations();
        const available = this.getAvailableMigrations();
        
        return available.filter(migration => !executed.includes(migration));
    }

    /**
     * Load and validate a migration file
     */
    loadMigration(version) {
        const migrationPath = path.join(this.migrationsDir, `${version}.js`);
        
        if (!fs.existsSync(migrationPath)) {
            throw new Error(`Migration file not found: ${migrationPath}`);
        }

        const migration = require(migrationPath);
        
        if (typeof migration.up !== 'function') {
            throw new Error(`Migration ${version} must export an 'up' function`);
        }
        
        if (typeof migration.down !== 'function') {
            throw new Error(`Migration ${version} must export a 'down' function`);
        }

        return migration;
    }

    /**
     * Execute a migration up
     */
    async runMigrationUp(version) {
        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');
            
            const migration = this.loadMigration(version);
            console.log(`Running migration ${version} up...`);
            
            await migration.up(client);
            
            // Record the migration as executed
            await client.query(
                `INSERT INTO ${this.migrationsTable} (version) VALUES ($1)`,
                [version]
            );
            
            await client.query('COMMIT');
            console.log(`Migration ${version} completed successfully`);
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`Migration ${version} failed:`, error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Execute a migration down
     */
    async runMigrationDown(version) {
        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');
            
            const migration = this.loadMigration(version);
            console.log(`Running migration ${version} down...`);
            
            await migration.down(client);
            
            // Remove the migration record
            await client.query(
                `DELETE FROM ${this.migrationsTable} WHERE version = $1`,
                [version]
            );
            
            await client.query('COMMIT');
            console.log(`Migration ${version} rolled back successfully`);
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`Migration rollback ${version} failed:`, error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Run all pending migrations
     */
    async migrateUp() {
        const pending = await this.getPendingMigrations();
        
        if (pending.length === 0) {
            console.log('No pending migrations');
            return;
        }

        console.log(`Running ${pending.length} pending migration(s):`);
        console.log(pending.map(m => `  - ${m}`).join('\n'));

        for (const version of pending) {
            await this.runMigrationUp(version);
        }

        console.log('All migrations completed successfully');
    }

    /**
     * Rollback the last executed migration
     */
    async migrateDown() {
        const executed = await this.getExecutedMigrations();
        
        if (executed.length === 0) {
            console.log('No migrations to rollback');
            return;
        }

        const lastMigration = executed[executed.length - 1];
        console.log(`Rolling back migration: ${lastMigration}`);
        
        await this.runMigrationDown(lastMigration);
    }

    /**
     * Show migration status
     */
    async showStatus() {
        const executed = await this.getExecutedMigrations();
        const available = this.getAvailableMigrations();
        const pending = await this.getPendingMigrations();

        console.log('\n=== Migration Status ===\n');
        
        console.log('Executed migrations:');
        if (executed.length === 0) {
            console.log('  (none)');
        } else {
            executed.forEach(migration => {
                console.log(`  ✓ ${migration}`);
            });
        }

        console.log('\nPending migrations:');
        if (pending.length === 0) {
            console.log('  (none)');
        } else {
            pending.forEach(migration => {
                console.log(`  - ${migration}`);
            });
        }

        console.log(`\nTotal migrations: ${available.length}`);
        console.log(`Executed: ${executed.length}`);
        console.log(`Pending: ${pending.length}`);
    }

    /**
     * Create a new migration file
     */
    createMigration(name) {
        if (!name) {
            throw new Error('Migration name is required');
        }

        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
        const filename = `${timestamp}_${name.toLowerCase().replace(/\s+/g, '_')}.js`;
        const filepath = path.join(this.migrationsDir, filename);

        const template = `/**
 * Migration: ${name}
 * Created: ${new Date().toISOString()}
 */

/**
 * Run the migration
 * @param {import('pg').PoolClient} client - Database client
 */
async function up(client) {
    // Add your migration code here
    // Example:
    // await client.query(\`
    //     CREATE TABLE example (
    //         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    //         name VARCHAR(255) NOT NULL,
    //         created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    //     );
    // \`);
}

/**
 * Rollback the migration
 * @param {import('pg').PoolClient} client - Database client
 */
async function down(client) {
    // Add your rollback code here
    // Example:
    // await client.query('DROP TABLE IF EXISTS example');
}

module.exports = { up, down };
`;

        fs.writeFileSync(filepath, template);
        console.log(`Created migration: ${filename}`);
        return filepath;
    }

    /**
     * Close database connection
     */
    async close() {
        await this.pool.end();
    }
}

// CLI handling
async function main() {
    const command = process.argv[2];
    const arg = process.argv[3];

    const runner = new MigrationRunner();

    try {
        switch (command) {
            case 'up':
                await runner.migrateUp();
                break;
            case 'down':
                await runner.migrateDown();
                break;
            case 'status':
                await runner.showStatus();
                break;
            case 'create':
                if (!arg) {
                    console.error('Usage: npm run migrate:create <migration_name>');
                    process.exit(1);
                }
                runner.createMigration(arg);
                break;
            default:
                console.log('Usage: npm run migrate:[up|down|status|create] [name]');
                console.log('Commands:');
                console.log('  up      - Run all pending migrations');
                console.log('  down    - Rollback the last migration');
                console.log('  status  - Show migration status');
                console.log('  create  - Create a new migration file');
        }
    } catch (error) {
        console.error('Migration error:', error.message);
        process.exit(1);
    } finally {
        await runner.close();
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = MigrationRunner;