/**
 * Migration: Create Users Table
 * Created: 2025-09-10T21:00:00Z
 * 
 * Creates the users table with WeChat OpenID integration and proper constraints
 */

/**
 * Run the migration - Create users table
 * @param {import('pg').PoolClient} client - Database client
 */
async function up(client) {
    console.log('Creating users table...');
    
    await client.query(`
        CREATE TABLE users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            wechat_openid VARCHAR(255) UNIQUE NOT NULL,
            nickname VARCHAR(100),
            avatar_url TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_login TIMESTAMP WITH TIME ZONE
        );
    `);

    // Add indexes for performance
    await client.query(`
        CREATE INDEX idx_users_wechat_openid ON users(wechat_openid);
    `);
    
    await client.query(`
        CREATE INDEX idx_users_created_at ON users(created_at);
    `);
    
    await client.query(`
        CREATE INDEX idx_users_last_login ON users(last_login);
    `);

    // Add updated_at trigger function for automatic timestamp updates
    await client.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ language 'plpgsql';
    `);

    // Create trigger for users table
    await client.query(`
        CREATE TRIGGER update_users_updated_at 
        BEFORE UPDATE ON users 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('Users table created successfully with indexes and triggers');
}

/**
 * Rollback the migration - Drop users table
 * @param {import('pg').PoolClient} client - Database client
 */
async function down(client) {
    console.log('Rolling back users table creation...');
    
    // Drop trigger first
    await client.query(`DROP TRIGGER IF EXISTS update_users_updated_at ON users;`);
    
    // Drop indexes (they'll be dropped with the table, but explicit for clarity)
    await client.query(`DROP INDEX IF EXISTS idx_users_wechat_openid;`);
    await client.query(`DROP INDEX IF EXISTS idx_users_created_at;`);
    await client.query(`DROP INDEX IF EXISTS idx_users_last_login;`);
    
    // Drop table
    await client.query(`DROP TABLE IF EXISTS users;`);
    
    console.log('Users table rolled back successfully');
}

module.exports = { up, down };