const pino = require('pino');
const config = require('../config/env');

const logger = pino({
  name: 'notification-service',
  level: config.nodeEnv === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
  base: {
    service: 'notification-service'
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = logger;
