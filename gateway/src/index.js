const app = require('./app');
const config = require('./config/env');
const logger = require('./utils/logger');

let server = null;

function start() {
  server = app.listen(config.port, () => {
    logger.info(`API Gateway running on port ${config.port}`);
    logger.info(`Routing:`);
    logger.info(`  /api/auth/*          -> ${config.authServiceUrl}`);
    logger.info(`  /api/transactions/*  -> ${config.transactionServiceUrl}`);
    logger.info(`  /api/notifications/* -> ${config.notificationServiceUrl}`);
    logger.info(`  /api/settings/*      -> ${config.notificationServiceUrl}`);
  });
}

async function gracefulShutdown(signal = 'SIGTERM') {
  logger.info({ signal }, 'Received shutdown signal. Closing API Gateway gracefully...');
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    logger.info('HTTP server closed.');
    server = null;
  }
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
