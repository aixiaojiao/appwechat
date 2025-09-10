/**
 * Migration: Create Devices Table
 * Created: 2025-09-10T21:00:00Z
 * 
 * Creates the devices table with foreign key relationship to users table
 */

/**
 * Run the migration - Create devices table
 * @param {import('pg').PoolClient} client - Database client
 */
async function up(client) {
    console.log('Creating devices table...');
    
    await client.query(`
        CREATE TABLE devices (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            device_id VARCHAR(255) NOT NULL,
            device_type VARCHAR(50),
            os_version VARCHAR(50),
            app_version VARCHAR(50),
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            CONSTRAINT unique_user_device UNIQUE(user_id, device_id)
        );
    `);

    // Add indexes for performance
    await client.query(`
        CREATE INDEX idx_devices_user_id ON devices(user_id);
    `);
    
    await client.query(`
        CREATE INDEX idx_devices_device_id ON devices(device_id);
    `);
    
    await client.query(`
        CREATE INDEX idx_devices_is_active ON devices(is_active);
    `);
    
    await client.query(`
        CREATE INDEX idx_devices_created_at ON devices(created_at);
    `);

    // Add composite index for common queries
    await client.query(`
        CREATE INDEX idx_devices_user_active ON devices(user_id, is_active);
    `);

    // Create trigger for devices table using the existing update function
    await client.query(`
        CREATE TRIGGER update_devices_updated_at 
        BEFORE UPDATE ON devices 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    // Add constraints for data validation
    await client.query(`
        ALTER TABLE devices 
        ADD CONSTRAINT chk_device_id_not_empty 
        CHECK (device_id IS NOT NULL AND device_id != '');
    `);

    await client.query(`
        ALTER TABLE devices 
        ADD CONSTRAINT chk_device_type_valid 
        CHECK (device_type IN ('ios', 'android', 'web', 'other') OR device_type IS NULL);
    `);

    console.log('Devices table created successfully with indexes, triggers, and constraints');
}

/**
 * Rollback the migration - Drop devices table
 * @param {import('pg').PoolClient} client - Database client
 */
async function down(client) {
    console.log('Rolling back devices table creation...');
    
    // Drop trigger first
    await client.query(`DROP TRIGGER IF EXISTS update_devices_updated_at ON devices;`);
    
    // Drop indexes (they'll be dropped with the table, but explicit for clarity)
    await client.query(`DROP INDEX IF EXISTS idx_devices_user_id;`);
    await client.query(`DROP INDEX IF EXISTS idx_devices_device_id;`);
    await client.query(`DROP INDEX IF EXISTS idx_devices_is_active;`);
    await client.query(`DROP INDEX IF EXISTS idx_devices_created_at;`);
    await client.query(`DROP INDEX IF EXISTS idx_devices_user_active;`);
    
    // Drop table (constraints will be dropped automatically)
    await client.query(`DROP TABLE IF EXISTS devices;`);
    
    console.log('Devices table rolled back successfully');
}

module.exports = { up, down };