process.env.NODE_ENV = 'test';
process.env.INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'test_internal_secret_32_characters';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_minimum_32_characters';
process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'test_jwt_secret_key_minimum_32_characters';

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
