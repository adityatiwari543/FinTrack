const app = require('./app');
const { connectDB } = require('./config/db');
const config = require('./config/env');
const logger = require('./utils/logger');

async function start() {
  try {
    await connectDB();
    app.listen(config.port, () => {
      logger.info(`Auth Service running on port ${config.port}`);
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start Auth Service');
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
