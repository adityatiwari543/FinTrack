const pino = require('pino');
const config = require('../config/env');

const logger = pino({
  name: 'api-gateway',
  level: config.nodeEnv === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
  base: {
    service: 'api-gateway'
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = logger;
