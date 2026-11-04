const app = require('./app');
const mongoose = require('mongoose');
const { connectDB } = require('./config/db');
const { initRabbitMQ, closeRabbitMQ } = require('./services/eventPublisher');
const config = require('./config/env');
const logger = require('./utils/logger');

let server = null;

async function start() {
  try {
    await connectDB();
    await initRabbitMQ();

    server = app.listen(config.port, () => {
      logger.info(`Transaction Service running on port ${config.port}`);
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start Transaction Service');
    process.exit(1);
  }
}

async function gracefulShutdown(signal) {
  logger.info({ signal }, 'Received shutdown signal. Closing Transaction Service gracefully...');
  if (server) {
    server.close(() => logger.info('HTTP server closed.'));
  }
  await closeRabbitMQ();
  await mongoose.connection.close();
  logger.info('Database and RabbitMQ connections closed. Exiting process.');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (process.env.NODE_ENV !== 'test') {
  start();
}
