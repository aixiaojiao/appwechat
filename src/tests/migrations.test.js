const MigrationRunner = require('../config/migrations');
const dbConnection = require('../config/database');
const fs = require('fs');
const path = require('path');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'storyspark_test';

describe('Database Migration Tests', () => {
  let migrationRunner;
  let testMigrationsDir;
  
  beforeAll(async () => {
    // Create test migrations directory
    testMigrationsDir = path.join(__dirname, '../test-migrations');
    if (!fs.existsSync(testMigrationsDir)) {
      fs.mkdirSync(testMigrationsDir, { recursive: true });
    }

    // Initialize migration runner with test environment
    migrationRunner = new MigrationRunner();
    migrationRunner.migrationsDir = testMigrationsDir;
    
    // Test database connection
    const connectionTest = await dbConnection.testConnection('test');
    if (!connectionTest.success) {
      console.error('Test database connection failed:', connectionTest.error);
      throw new Error('Cannot connect to test database');
    }
    
    console.log('✅ Test database connected for migrations:', connectionTest.timestamp);

    // Clean up any existing test data
    await cleanupTestEnvironment();
  });

  afterAll(async () => {
    await cleanupTestEnvironment();
    
    // Clean up test migrations directory
    if (fs.existsSync(testMigrationsDir)) {
      fs.rmSync(testMigrationsDir, { recursive: true, force: true });
    }
    
    // Close migration runner connection
    await migrationRunner.close();
    
    // Close test database connection
    await dbConnection.close('test');
  });

  beforeEach(async () => {
    // Clean up before each test
    await cleanupTestEnvironment();
  });

  afterEach(async () => {
    // Clean up after each test
    await cleanupTestEnvironment();
  });

  async function cleanupTestEnvironment() {
    try {
      // Drop test tables if they exist
      await migrationRunner.pool.query('DROP TABLE IF EXISTS test_migration_table CASCADE');
      await migrationRunner.pool.query('DROP TABLE IF EXISTS another_test_table CASCADE');
      
      // Clean up migration tracking table
      await migrationRunner.pool.query(`DELETE FROM ${migrationRunner.migrationsTable} WHERE version LIKE 'test_%'`);
    } catch (error) {
      console.log('Cleanup note: tables may not exist yet:', error.message);
    }
  }

  function createTestMigration(version, upSQL, downSQL) {
    const migrationContent = `
/**
 * Test Migration: ${version}
 */

async function up(client) {
  ${upSQL}
}

async function down(client) {
  ${downSQL}
}

module.exports = { up, down };
`;
    
    const filePath = path.join(testMigrationsDir, `${version}.js`);
    fs.writeFileSync(filePath, migrationContent);
    return filePath;
  }

  describe('Migration System Core Functionality', () => {
    test('Migration tracking table initialization', async () => {
      await migrationRunner.initializeMigrationsTable();
      
      // Check if table exists by querying it
      const result = await migrationRunner.pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = $1 AND table_schema = 'public'
      `, [migrationRunner.migrationsTable]);
      
      expect(result.rows.length).toBe(1);
      
      console.log('✅ Migration tracking table initialized');
    });

    test('Get available and executed migrations', async () => {
      // Create test migration files
      createTestMigration('test_001_create_test_table', 
        'await client.query("CREATE TABLE test_migration_table (id SERIAL PRIMARY KEY, name VARCHAR(255))");',
        'await client.query("DROP TABLE IF EXISTS test_migration_table");'
      );
      
      createTestMigration('test_002_add_test_column',
        'await client.query("ALTER TABLE test_migration_table ADD COLUMN description TEXT");',
        'await client.query("ALTER TABLE test_migration_table DROP COLUMN IF EXISTS description");'
      );

      const available = migrationRunner.getAvailableMigrations();
      const executed = await migrationRunner.getExecutedMigrations();
      const pending = await migrationRunner.getPendingMigrations();

      expect(available).toContain('test_001_create_test_table');
      expect(available).toContain('test_002_add_test_column');
      expect(executed).not.toContain('test_001_create_test_table');
      expect(pending).toContain('test_001_create_test_table');
      expect(pending).toContain('test_002_add_test_column');

      console.log('✅ Migration listing working:', {
        available: available.filter(m => m.startsWith('test_')).length,
        executed: executed.filter(m => m.startsWith('test_')).length,
        pending: pending.filter(m => m.startsWith('test_')).length
      });
    });

    test('Single migration up execution', async () => {
      // Create test migration
      createTestMigration('test_003_single_up',
        'await client.query("CREATE TABLE test_migration_table (id SERIAL PRIMARY KEY, name VARCHAR(255))");',
        'await client.query("DROP TABLE IF EXISTS test_migration_table");'
      );

      // Run the migration up
      await migrationRunner.runMigrationUp('test_003_single_up');

      // Verify table was created
      const result = await migrationRunner.pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'test_migration_table' AND table_schema = 'public'
      `);
      expect(result.rows.length).toBe(1);

      // Verify migration was recorded
      const executed = await migrationRunner.getExecutedMigrations();
      expect(executed).toContain('test_003_single_up');

      console.log('✅ Single migration up execution working');
    });

    test('Single migration down execution', async () => {
      // Create and run a migration up first
      createTestMigration('test_004_single_down',
        'await client.query("CREATE TABLE test_migration_table (id SERIAL PRIMARY KEY, name VARCHAR(255))");',
        'await client.query("DROP TABLE IF EXISTS test_migration_table");'
      );
      
      await migrationRunner.runMigrationUp('test_004_single_down');

      // Verify table exists
      let result = await migrationRunner.pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'test_migration_table' AND table_schema = 'public'
      `);
      expect(result.rows.length).toBe(1);

      // Run the migration down
      await migrationRunner.runMigrationDown('test_004_single_down');

      // Verify table was dropped
      result = await migrationRunner.pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'test_migration_table' AND table_schema = 'public'
      `);
      expect(result.rows.length).toBe(0);

      // Verify migration record was removed
      const executed = await migrationRunner.getExecutedMigrations();
      expect(executed).not.toContain('test_004_single_down');

      console.log('✅ Single migration down execution working');
    });

    test('Multiple migrations up execution', async () => {
      // Create multiple test migrations
      createTestMigration('test_005_multi_1',
        'await client.query("CREATE TABLE test_migration_table (id SERIAL PRIMARY KEY, name VARCHAR(255))");',
        'await client.query("DROP TABLE IF EXISTS test_migration_table");'
      );
      
      createTestMigration('test_006_multi_2',
        'await client.query("ALTER TABLE test_migration_table ADD COLUMN email VARCHAR(255)");',
        'await client.query("ALTER TABLE test_migration_table DROP COLUMN IF EXISTS email");'
      );
      
      createTestMigration('test_007_multi_3',
        'await client.query("CREATE TABLE another_test_table (id SERIAL PRIMARY KEY, data TEXT)");',
        'await client.query("DROP TABLE IF EXISTS another_test_table");'
      );

      // Run all pending migrations
      await migrationRunner.migrateUp();

      // Verify all tables exist
      const tables = await migrationRunner.pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name IN ('test_migration_table', 'another_test_table') 
        AND table_schema = 'public'
      `);
      expect(tables.rows.length).toBe(2);

      // Verify email column exists
      const columns = await migrationRunner.pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'test_migration_table' 
        AND column_name = 'email'
      `);
      expect(columns.rows.length).toBe(1);

      // Verify all migrations were recorded
      const executed = await migrationRunner.getExecutedMigrations();
      expect(executed).toContain('test_005_multi_1');
      expect(executed).toContain('test_006_multi_2');
      expect(executed).toContain('test_007_multi_3');

      console.log('✅ Multiple migrations up execution working:', {
        tablesCreated: tables.rows.length,
        migrationsExecuted: executed.filter(m => m.startsWith('test_')).length
      });
    });

    test('Migration rollback functionality', async () => {
      // Create and run migrations
      createTestMigration('test_008_rollback_1',
        'await client.query("CREATE TABLE test_migration_table (id SERIAL PRIMARY KEY, name VARCHAR(255))");',
        'await client.query("DROP TABLE IF EXISTS test_migration_table");'
      );
      
      createTestMigration('test_009_rollback_2',
        'await client.query("ALTER TABLE test_migration_table ADD COLUMN description TEXT");',
        'await client.query("ALTER TABLE test_migration_table DROP COLUMN IF EXISTS description");'
      );

      await migrationRunner.migrateUp();

      // Verify both migrations are executed
      let executed = await migrationRunner.getExecutedMigrations();
      expect(executed).toContain('test_008_rollback_1');
      expect(executed).toContain('test_009_rollback_2');

      // Rollback last migration
      await migrationRunner.migrateDown();

      // Verify only the last migration was rolled back
      executed = await migrationRunner.getExecutedMigrations();
      expect(executed).toContain('test_008_rollback_1');
      expect(executed).not.toContain('test_009_rollback_2');

      // Verify description column was removed
      const columns = await migrationRunner.pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'test_migration_table' 
        AND column_name = 'description'
      `);
      expect(columns.rows.length).toBe(0);

      console.log('✅ Migration rollback functionality working');
    });

    test('Migration status reporting', async () => {
      // Create test migrations
      createTestMigration('test_010_status_1',
        'await client.query("CREATE TABLE test_migration_table (id SERIAL PRIMARY KEY, name VARCHAR(255))");',
        'await client.query("DROP TABLE IF EXISTS test_migration_table");'
      );
      
      createTestMigration('test_011_status_2',
        'await client.query("ALTER TABLE test_migration_table ADD COLUMN status VARCHAR(50)");',
        'await client.query("ALTER TABLE test_migration_table DROP COLUMN IF EXISTS status");'
      );

      // Run only first migration
      await migrationRunner.runMigrationUp('test_010_status_1');

      const available = migrationRunner.getAvailableMigrations();
      const executed = await migrationRunner.getExecutedMigrations();
      const pending = await migrationRunner.getPendingMigrations();

      const testAvailable = available.filter(m => m.startsWith('test_'));
      const testExecuted = executed.filter(m => m.startsWith('test_'));
      const testPending = pending.filter(m => m.startsWith('test_'));

      expect(testExecuted).toContain('test_010_status_1');
      expect(testExecuted).not.toContain('test_011_status_2');
      expect(testPending).toContain('test_011_status_2');
      expect(testPending).not.toContain('test_010_status_1');

      console.log('✅ Migration status reporting working:', {
        available: testAvailable.length,
        executed: testExecuted.length,
        pending: testPending.length
      });
    });
  });

  describe('Migration Error Handling', () => {
    test('Invalid migration file handling', async () => {
      // Create invalid migration (missing down function)
      const invalidMigrationContent = `
        async function up(client) {
          await client.query("CREATE TABLE test_table (id SERIAL)");
        }
        
        module.exports = { up };
      `;
      
      fs.writeFileSync(path.join(testMigrationsDir, 'test_012_invalid.js'), invalidMigrationContent);

      await expect(migrationRunner.loadMigration('test_012_invalid')).rejects.toThrow('must export a \'down\' function');
      
      console.log('✅ Invalid migration file handling working');
    });

    test('SQL error during migration', async () => {
      // Create migration with invalid SQL
      createTestMigration('test_013_sql_error',
        'await client.query("CREATE TABLE invalid_sql_syntax )(");', // Invalid SQL
        'await client.query("DROP TABLE IF EXISTS test_migration_table");'
      );

      await expect(migrationRunner.runMigrationUp('test_013_sql_error')).rejects.toThrow();
      
      // Verify migration wasn't recorded due to rollback
      const executed = await migrationRunner.getExecutedMigrations();
      expect(executed).not.toContain('test_013_sql_error');

      console.log('✅ SQL error handling and rollback working');
    });

    test('Transaction rollback on failure', async () => {
      // Create migration that succeeds partially then fails
      createTestMigration('test_014_transaction_rollback',
        `
        await client.query("CREATE TABLE test_migration_table (id SERIAL PRIMARY KEY)");
        await client.query("INSERT INTO test_migration_table DEFAULT VALUES");
        await client.query("INVALID SQL THAT WILL FAIL");
        `,
        'await client.query("DROP TABLE IF EXISTS test_migration_table");'
      );

      await expect(migrationRunner.runMigrationUp('test_014_transaction_rollback')).rejects.toThrow();
      
      // Verify table was not created (transaction rolled back)
      const result = await migrationRunner.pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'test_migration_table' AND table_schema = 'public'
      `);
      expect(result.rows.length).toBe(0);

      console.log('✅ Transaction rollback on failure working');
    });
  });

  describe('Migration Creation', () => {
    test('Migration file creation', () => {
      const migrationPath = migrationRunner.createMigration('test_new_migration');
      
      expect(fs.existsSync(migrationPath)).toBe(true);
      
      const content = fs.readFileSync(migrationPath, 'utf8');
      expect(content).toContain('async function up(client)');
      expect(content).toContain('async function down(client)');
      expect(content).toContain('test_new_migration');

      console.log('✅ Migration file creation working:', path.basename(migrationPath));
    });

    test('Migration filename format', () => {
      const migrationPath = migrationRunner.createMigration('Create User Table');
      const filename = path.basename(migrationPath);
      
      expect(filename).toMatch(/^\d{8}T\d{6}_create_user_table\.js$/);

      console.log('✅ Migration filename format working:', filename);
    });
  });
});

console.log('\n🧪 Database Migration Test Suite');
console.log('================================');
console.log('This comprehensive test suite validates:');
console.log('• Migration system initialization');
console.log('• Up and down migration execution');
console.log('• Transaction handling and rollback');
console.log('• Error handling and recovery');
console.log('• Migration status tracking');
console.log('• File creation and validation');
console.log('================================\n');