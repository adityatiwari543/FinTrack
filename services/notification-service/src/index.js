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

async function gracefulShutdown(signal) {
  logger.info({ signal }, 'Received shutdown signal. Closing Notification Service gracefully...');
  if (server) {
    server.close(() => logger.info('HTTP server closed.'));
  }
  await closeRabbitMQConsumer();
  await mongoose.connection.close();
  logger.info('Database and RabbitMQ connections closed. Exiting process.');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (process.env.NODE_ENV !== 'test') {
  start();
}
