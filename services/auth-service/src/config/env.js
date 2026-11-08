const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment configuration from service .env, root .env, or process.cwd()
const serviceEnvPath = path.resolve(__dirname, '../../.env');
const rootEnvPath = path.resolve(__dirname, '../../../../.env');

if (fs.existsSync(serviceEnvPath)) {
  dotenv.config({ path: serviceEnvPath });
}
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}
dotenv.config();

const internalServiceSecret = process.env.INTERNAL_SERVICE_SECRET || 
  (process.env.NODE_ENV === 'test' ? 'test_internal_secret_32_characters' : 'fintrack_internal_cluster_secret_fallback_2026_key_32chars');

const mongoUri = process.env.AUTH_MONGO_URI || process.env.MONGO_URI || process.env.MONGODB_URI || process.env.ATLAS_URI || (process.env.NODE_ENV === 'test' ? 'mongodb://127.0.0.1:27018/fintrack_auth_test' : '');
const dbName = process.env.AUTH_DB_NAME || process.env.DB_NAME || 'fintrack_auth';

if (!mongoUri && process.env.NODE_ENV !== 'test') {
  throw new Error('FATAL: MongoDB URI configuration is missing for Auth Service. Please define AUTH_MONGO_URI or MONGO_URI.');
}

module.exports = {
  port: Number(process.env.AUTH_PORT) || (process.env.PORT && Number(process.env.PORT) !== 8000 ? Number(process.env.PORT) : 5001),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri,
  dbName,
  jwtSecret: process.env.JWT_SECRET || 'fintrack_jwt_access_super_secret_key_change_in_production_32chars',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || 'fintrack_jwt_refresh_super_secret_key_change_in_production_32chars',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  cookiePath: process.env.COOKIE_PATH || '/api/auth',
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  cookieSecure: process.env.COOKIE_SECURE !== undefined ? process.env.COOKIE_SECURE === 'true' : (process.env.RENDER ? true : process.env.NODE_ENV === 'production'),
  cookieSameSite: process.env.COOKIE_SAMESITE || (process.env.RENDER ? 'none' : (process.env.NODE_ENV === 'production' ? 'strict' : 'lax')),
  internalServiceSecret
};
