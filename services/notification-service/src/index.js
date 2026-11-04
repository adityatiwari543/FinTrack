const app = require('./app');
const { connectDB } = require('./config/db');
const { initRabbitMQConsumer } = require('./services/eventConsumer');
const config = require('./config/env');
const logger = require('./utils/logger');

async function start() {
  try {
    await connectDB();
    await initRabbitMQConsumer();

    app.listen(config.port, () => {
      logger.info(`Notification Service running on port ${config.port}`);
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start Notification Service');
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
