const logger = require('../utils/logger');

function requestLogger(req, res, next) {
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  req.id = requestId;
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
    }, 'Handled request');
  });

  next();
}

module.exports = requestLogger;
