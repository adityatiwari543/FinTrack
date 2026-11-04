const { sendError } = require('../utils/response');

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));
      return sendError(res, 'Validation failed', 400, details, 'VALIDATION_ERROR');
    }
    req.validatedBody = result.data;
    next();
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const details = result.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));
      return sendError(res, 'Invalid query parameters', 400, details, 'VALIDATION_ERROR');
    }
    req.validatedQuery = result.data;
    next();
  };
}

module.exports = {
  validateBody,
  validateQuery
};
