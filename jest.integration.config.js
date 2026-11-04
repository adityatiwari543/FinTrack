module.exports = {
  testEnvironment: 'node',
  moduleDirectories: [
    'node_modules',
    '<rootDir>/services/transaction-service/node_modules',
    '<rootDir>/gateway/node_modules',
    '<rootDir>/services/auth-service/node_modules',
    '<rootDir>/services/notification-service/node_modules'
  ],
  testMatch: [
    '<rootDir>/tests/integration/**/*.integration.test.js',
    '<rootDir>/gateway/tests/gateway.integration.test.js'
  ],
  testTimeout: 30000,
  verbose: true
};
