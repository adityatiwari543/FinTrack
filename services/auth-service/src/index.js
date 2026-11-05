const app = require('./app');
const { connectDB, disconnectDB } = require('./config/db');
const config = require('./config/env');
const logger = require('./utils/logger');

let server = null;

async function start() {
  try {
    await connectDB();
    server = app.listen(config.port, () => {
      logger.info(`Auth Service running on port ${config.port}`);
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start Auth Service');
    process.exit(1);
  }
}

async function gracefulShutdown(signal = 'SIGTERM') {
  logger.info({ signal }, 'Received shutdown signal. Closing Auth Service gracefully...');
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    logger.info('HTTP server closed.');
    server = null;
  }
  await disconnectDB();
  logger.info('Database connection closed. Exiting process.');
  if (process.env.NODE_ENV !== 'test') {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (process.env.NODE_ENV !== 'test') {
  start();
}

module.exports = {
  start,
  gracefulShutdown,
  getServer: () => server
};
