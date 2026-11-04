const { sendError } = require('../utils/response');
const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  const log = req.log || logger;
  log.error({ err, path: req.path }, 'Unhandled error caught in middleware');

  if (err.name === 'ValidationError') {
    return sendError(res, err.message, 400, null, 'VALIDATION_ERROR');
  }

  if (err.code === 11000) {
    return sendError(res, 'Duplicate key error: Email already registered', 409, null, 'DUPLICATE_KEY');
  }

  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'Internal Server Error'
    : err.message || 'Internal Server Error';

  return sendError(res, message, statusCode, null, 'INTERNAL_ERROR');
}

module.exports = errorHandler;
