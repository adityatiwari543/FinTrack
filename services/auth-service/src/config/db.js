const mongoose = require('mongoose');
const logger = require('../utils/logger');
const config = require('./env');

async function connectDB(uri = config.mongoUri, dbName = config.dbName) {
  try {
    if (!uri) {
      throw new Error('Database connection URI is missing for Auth Service.');
    }

    await mongoose.connect(uri, {
      dbName,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000
    });

    // CRITICAL SECURITY: Never print or log URI/credentials. Log only the database name and connection state.
    logger.info({ database: dbName, status: 'connected' }, 'Connected to Auth MongoDB database');
  } catch (err) {
    // Sanitize any error message before logging so credentials can never be leaked
    const safeMsg = (err?.message || 'Database connection error').replace(/mongodb(\+srv)?:\/\/[^@]+@/i, 'mongodb$1://****:****@');
    logger.error({ errorName: err?.name, error: safeMsg, database: dbName }, 'Failed to connect to Auth MongoDB database');
    throw new Error(`Database connection failure for ${dbName}: ${err?.name || 'Error'}`);
  }
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = {
  connectDB,
  disconnectDB
};
