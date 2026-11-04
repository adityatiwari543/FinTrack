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

module.exports = {
  validateBody
};
