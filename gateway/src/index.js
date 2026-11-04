const app = require('./app');
const config = require('./config/env');
const logger = require('./utils/logger');

function start() {
  app.listen(config.port, () => {
    logger.info(`API Gateway running on port ${config.port}`);
    logger.info(`Routing:`);
    logger.info(`  /api/auth/*          -> ${config.authServiceUrl}`);
    logger.info(`  /api/transactions/*  -> ${config.transactionServiceUrl}`);
    logger.info(`  /api/notifications/* -> ${config.notificationServiceUrl}`);
    logger.info(`  /api/settings/*      -> ${config.notificationServiceUrl}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
