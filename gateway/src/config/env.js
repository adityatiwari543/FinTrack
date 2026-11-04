const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  port: process.env.PORT || 8000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'fintrack_jwt_access_super_secret_key_change_in_production_32chars',
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:5001',
  transactionServiceUrl: process.env.TRANSACTION_SERVICE_URL || 'http://localhost:5002',
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:5003',
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 mins
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || 200
};
