const logger = require('../utils/logger');
const crypto = require('crypto');

function requestLogger(req, res, next) {
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  req.id = requestId;
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);

  req.log = logger.child({ requestId });

  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    req.log.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`
    }, 'Gateway routed request');
  });

  next();
}

module.exports = requestLogger;
