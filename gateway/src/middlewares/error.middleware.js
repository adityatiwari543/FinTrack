const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  const log = req.log || logger;
  log.error({ err, path: req.path }, 'Gateway error');

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Gateway Error';

  return res.status(statusCode).json({
    success: false,
    error: {
      message,
      code: 'GATEWAY_ERROR'
    }
  });
}

module.exports = errorHandler;
