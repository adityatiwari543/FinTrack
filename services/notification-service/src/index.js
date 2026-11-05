const app = require('./app');
const mongoose = require('mongoose');
const { connectDB } = require('./config/db');
const { initRabbitMQConsumer, closeRabbitMQConsumer } = require('./services/eventConsumer');
const config = require('./config/env');
const logger = require('./utils/logger');

let server = null;

async function start() {
  try {
    await connectDB();
    await initRabbitMQConsumer();

    server = app.listen(config.port, () => {
      logger.info(`Notification Service running on port ${config.port}`);
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start Notification Service');
    process.exit(1);
  }
}

async function gracefulShutdown(signal = 'SIGTERM') {
  logger.info({ signal }, 'Received shutdown signal. Closing Notification Service gracefully...');
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    logger.info('HTTP server closed.');
    server = null;
  }
  await closeRabbitMQConsumer();
  await mongoose.connection.close();
  logger.info('Database and RabbitMQ connections closed. Exiting process.');
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
