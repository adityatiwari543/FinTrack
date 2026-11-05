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

async function gracefulShutdown(signal = 'SIGTERM') {
  logger.info({ signal }, 'Received shutdown signal. Closing Transaction Service gracefully...');
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    logger.info('HTTP server closed.');
    server = null;
  }
  await closeRabbitMQ();
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
