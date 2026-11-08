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

const internalServiceSecret = process.env.INTERNAL_SERVICE_SECRET || 
  (process.env.NODE_ENV === 'test' ? 'test_internal_secret_32_characters' : 'fintrack_internal_cluster_secret_fallback_2026_key_32chars');

const rawOrigins = process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173,http://localhost:3000';
const allowedOrigins = rawOrigins.split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean);

module.exports = {
  port: process.env.PORT || 8000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  allowedOrigins,
  jwtSecret: process.env.JWT_SECRET || 'fintrack_jwt_access_super_secret_key_change_in_production_32chars',
  internalServiceSecret,
  authServiceUrl: (process.env.AUTH_SERVICE_URL || (process.env.RENDER ? 'http://fintrack-auth-service:5001' : 'http://localhost:5001')).replace(/\/+$/, ''),
  transactionServiceUrl: (process.env.TRANSACTION_SERVICE_URL || (process.env.RENDER ? 'http://fintrack-transaction-service:5002' : 'http://localhost:5002')).replace(/\/+$/, ''),
  notificationServiceUrl: (process.env.NOTIFICATION_SERVICE_URL || (process.env.RENDER ? 'http://fintrack-notification-service:5003' : 'http://localhost:5003')).replace(/\/+$/, ''),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 mins
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || 200
};
