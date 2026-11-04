const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  const log = req.log || logger;
  log.error({ err, path: req.path }, 'Gateway error');

  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Gateway Error';
  const code = err.code || 'GATEWAY_ERROR';

  return res.status(statusCode).json({
    success: false,
    error: {
      message,
      code
    }
  });
}

module.exports = errorHandler;
