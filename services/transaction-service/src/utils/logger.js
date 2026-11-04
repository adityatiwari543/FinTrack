const pino = require('pino');
const config = require('../config/env');

const logger = pino({
  name: 'transaction-service',
  level: config.nodeEnv === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
  base: {
    service: 'transaction-service'
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = logger;
