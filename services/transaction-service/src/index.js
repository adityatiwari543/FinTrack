const app = require('./app');
const { connectDB } = require('./config/db');
const { initRabbitMQ } = require('./services/eventPublisher');
const config = require('./config/env');
const logger = require('./utils/logger');

async function start() {
  try {
    await connectDB();
    await initRabbitMQ();

    app.listen(config.port, () => {
      logger.info(`Transaction Service running on port ${config.port}`);
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start Transaction Service');
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
