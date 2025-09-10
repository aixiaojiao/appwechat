/**
 * Jest Test Setup
 * Global setup and teardown for all tests
 */

const dbConnection = require('../config/database');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'storyspark_test';

// Global test setup
beforeAll(async () => {
  // Ensure test database connection is available
  const connectionTest = await dbConnection.testConnection('test');
  if (!connectionTest.success) {
    console.error('❌ Test database connection failed:', connectionTest.error);
    throw new Error('Cannot connect to test database. Please ensure PostgreSQL is running and test database exists.');
  }
  
  console.log('✅ Global test setup complete - database connected');
});

// Global test teardown
afterAll(async () => {
  // Close all database connections
  await dbConnection.closeAll();
  console.log('✅ Global test teardown complete - all database connections closed');
});

// Increase test timeout for database operations
jest.setTimeout(30000);

// Mock console methods to reduce noise during testing
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  // Only show test output and important messages
  console.log = (...args) => {
    const message = args.join(' ');
    if (message.includes('✅') || message.includes('❌') || message.includes('🧪')) {
      originalConsoleLog.apply(console, args);
    }
  };

  // Still show errors
  console.error = originalConsoleError;
});

afterAll(() => {
  // Restore original console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});