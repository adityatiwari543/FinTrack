const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment configuration from gateway .env, root .env, or process.cwd()
const gatewayEnvPath = path.resolve(__dirname, '../../.env');
const rootEnvPath = path.resolve(__dirname, '../../../../.env');

if (fs.existsSync(gatewayEnvPath)) {
  dotenv.config({ path: gatewayEnvPath });
}
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}
dotenv.config();

const internalServiceSecret = process.env.INTERNAL_SERVICE_SECRET || (process.env.NODE_ENV === 'test' ? 'test_internal_secret_32_characters' : '');

if (process.env.NODE_ENV === 'production' && !internalServiceSecret) {
  throw new Error('FATAL: INTERNAL_SERVICE_SECRET is required in production');
}

const rawOrigins = process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173,http://localhost:3000';
const allowedOrigins = rawOrigins.split(',').map(o => o.trim()).filter(Boolean);

module.exports = {
  port: process.env.PORT || 8000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  allowedOrigins,
  jwtSecret: process.env.JWT_SECRET || 'fintrack_jwt_access_super_secret_key_change_in_production_32chars',
  internalServiceSecret,
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:5001',
  transactionServiceUrl: process.env.TRANSACTION_SERVICE_URL || 'http://localhost:5002',
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:5003',
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 mins
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || 200
};
