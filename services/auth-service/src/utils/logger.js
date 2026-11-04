const pino = require('pino');
const config = require('../config/env');

const logger = pino({
  name: 'auth-service',
  level: config.nodeEnv === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
  base: {
    service: 'auth-service'
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = logger;
