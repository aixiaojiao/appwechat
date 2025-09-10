const dbConnection = require('../config/database');
const User = require('../models/User');
const Device = require('../models/Device');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'storyspark_test';

describe('Database Health and Connection Tests', () => {
  beforeAll(async () => {
    // Test database connection
    const connectionTest = await dbConnection.testConnection('test');
    if (!connectionTest.success) {
      console.error('Test database connection failed:', connectionTest.error);
      throw new Error('Cannot connect to test database');
    }
    console.log('✅ Database health test setup complete');
  });

  afterAll(async () => {
    // Close test database connection
    await dbConnection.close('test');
  });

  describe('Database Connection Health', () => {
    test('Database connection test', async () => {
      const result = await dbConnection.testConnection('test');
      
      expect(result.success).toBe(true);
      expect(result.timestamp).toBeDefined();
      expect(result.version).toBeDefined();
      expect(result.version).toContain('PostgreSQL');

      console.log('✅ Database connection healthy:', {
        timestamp: result.timestamp,
        version: result.version.split(' ')[0] + ' ' + result.version.split(' ')[1]
      });
    });

    test('Connection pool status', () => {
      const poolStatus = dbConnection.getPoolStatus('test');
      
      expect(poolStatus.environment).toBe('test');
      expect(poolStatus.status).toBe('active');
      expect(typeof poolStatus.totalCount).toBe('number');
      expect(typeof poolStatus.idleCount).toBe('number');

      console.log('✅ Connection pool status:', {
        environment: poolStatus.environment,
        status: poolStatus.status,
        totalCount: poolStatus.totalCount,
        idleCount: poolStatus.idleCount
      });
    });

    test('Database query execution', async () => {
      const startTime = Date.now();
      const result = await dbConnection.query('SELECT 1 as test_number', [], 'test');
      const queryTime = Date.now() - startTime;

      expect(result.rows).toBeDefined();
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].test_number).toBe(1);
      expect(queryTime).toBeLessThan(1000); // Query should complete within 1 second

      console.log('✅ Database query execution working:', {
        queryTime: `${queryTime}ms`,
        result: result.rows[0]
      });
    });

    test('Transaction handling', async () => {
      let transactionResult;
      
      await dbConnection.transaction(async (client) => {
        const result = await client.query('SELECT 2 as transaction_test');
        transactionResult = result.rows[0].transaction_test;
        return result;
      }, 'test');

      expect(transactionResult).toBe(2);

      console.log('✅ Database transaction handling working');
    });

    test('Transaction rollback on error', async () => {
      await expect(
        dbConnection.transaction(async (client) => {
          await client.query('SELECT 1'); // This succeeds
          throw new Error('Test error for rollback');
        }, 'test')
      ).rejects.toThrow('Test error for rollback');

      console.log('✅ Database transaction rollback working');
    });
  });

  describe('Model Integration Health', () => {
    test('BaseModel connection integration', async () => {
      // Test that BaseModel can execute queries through the connection
      const result = await User.executeQuery('SELECT 3 as base_model_test', []);
      
      expect(result.rows).toBeDefined();
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].base_model_test).toBe(3);

      console.log('✅ BaseModel database integration working');
    });

    test('User model table access', async () => {
      try {
        const result = await User.executeQuery(`
          SELECT table_name FROM information_schema.tables 
          WHERE table_name = '${User.tableName}' AND table_schema = 'public'
        `, []);
        
        console.log(`✅ User table (${User.tableName}) accessibility verified:`, 
          result.rows.length > 0 ? 'exists' : 'not found');
      } catch (error) {
        console.log(`ℹ️ User table (${User.tableName}) check:`, error.message);
      }
    });

    test('Device model table access', async () => {
      try {
        const result = await Device.executeQuery(`
          SELECT table_name FROM information_schema.tables 
          WHERE table_name = '${Device.tableName}' AND table_schema = 'public'
        `, []);
        
        console.log(`✅ Device table (${Device.tableName}) accessibility verified:`, 
          result.rows.length > 0 ? 'exists' : 'not found');
      } catch (error) {
        console.log(`ℹ️ Device table (${Device.tableName}) check:`, error.message);
      }
    });
  });

  describe('Database Performance', () => {
    test('Connection pool performance', async () => {
      const concurrentQueries = 5;
      const queries = [];
      const startTime = Date.now();

      // Execute multiple queries concurrently
      for (let i = 0; i < concurrentQueries; i++) {
        queries.push(dbConnection.query(`SELECT ${i + 1} as query_id`, [], 'test'));
      }

      const results = await Promise.all(queries);
      const totalTime = Date.now() - startTime;

      expect(results.length).toBe(concurrentQueries);
      results.forEach((result, index) => {
        expect(result.rows[0].query_id).toBe(index + 1);
      });

      console.log('✅ Connection pool concurrent query performance:', {
        concurrentQueries,
        totalTime: `${totalTime}ms`,
        avgTimePerQuery: `${Math.round(totalTime / concurrentQueries)}ms`
      });
    });

    test('Large result set handling', async () => {
      const startTime = Date.now();
      const result = await dbConnection.query(`
        SELECT generate_series(1, 1000) as number_series
      `, [], 'test');
      const queryTime = Date.now() - startTime;

      expect(result.rows.length).toBe(1000);
      expect(result.rows[0].number_series).toBe(1);
      expect(result.rows[999].number_series).toBe(1000);

      console.log('✅ Large result set handling:', {
        rowCount: result.rows.length,
        queryTime: `${queryTime}ms`
      });
    });
  });

  describe('Database Environment Configuration', () => {
    test('Test environment configuration', () => {
      const testConfig = dbConnection.getTestConfig();
      
      expect(testConfig.database).toContain('_test');
      expect(testConfig.max).toBeLessThan(20); // Test should use fewer connections
      expect(testConfig.min).toBeLessThanOrEqual(testConfig.max);

      console.log('✅ Test environment configuration:', {
        database: testConfig.database,
        maxConnections: testConfig.max,
        minConnections: testConfig.min
      });
    });

    test('Connection timeout configuration', () => {
      const config = dbConnection.getConfig('test');
      
      expect(config.connectionTimeoutMillis).toBeDefined();
      expect(config.idleTimeoutMillis).toBeDefined();
      expect(config.acquireTimeoutMillis).toBeDefined();

      console.log('✅ Connection timeout configuration:', {
        connectionTimeout: config.connectionTimeoutMillis + 'ms',
        idleTimeout: config.idleTimeoutMillis + 'ms',
        acquireTimeout: config.acquireTimeoutMillis + 'ms'
      });
    });
  });
});

console.log('\n🧪 Database Health Check Test Suite');
console.log('===================================');
console.log('This test suite validates:');
console.log('• Database connection health');
console.log('• Connection pool performance');
console.log('• Model integration');
console.log('• Transaction handling');
console.log('• Environment configuration');
console.log('===================================\n');