const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  port: process.env.PORT || 5001,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/fintrack_auth',
  jwtSecret: process.env.JWT_SECRET || 'fintrack_jwt_access_super_secret_key_change_in_production_32chars',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || 'fintrack_jwt_refresh_super_secret_key_change_in_production_32chars',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'
};
