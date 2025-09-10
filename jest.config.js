module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Collect coverage from these files
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/migrations/**/*.js',
    '!src/tests/**/*.js',
    '!src/server.js'
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.js'],

  // Test timeout (increased for database operations)
  testTimeout: 30000,

  // Test patterns
  testMatch: [
    '<rootDir>/src/tests/**/*.test.js'
  ],

  // Module paths
  moduleDirectories: ['node_modules', 'src'],

  // Verbose output
  verbose: true,

  // Force exit after tests complete
  forceExit: true,

  // Detect open handles (useful for database connections)
  detectOpenHandles: true,

  // Clear mocks between tests
  clearMocks: true,

  // Reset modules between tests
  resetModules: true
};