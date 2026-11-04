const mongoose = require('mongoose');
const logger = require('../utils/logger');
const config = require('./env');

async function connectDB(uri = config.mongoUri) {
  try {
    await mongoose.connect(uri);
    logger.info({ uri: uri.replace(/:[^:]*@/, ':****@') }, 'Connected to Auth MongoDB database');
  } catch (err) {
    logger.error({ err }, 'Failed to connect to Auth MongoDB database');
    throw err;
  }
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = {
  connectDB,
  disconnectDB
};
