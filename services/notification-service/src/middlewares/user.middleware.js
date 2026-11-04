const { sendError } = require('../utils/response');

function requireUser(req, res, next) {
  const userId = req.headers['x-user-id'];

  if (!userId) {
    return sendError(res, 'Authentication required: missing user identity', 401, null, 'UNAUTHORIZED');
  }

  req.userId = userId;
  next();
}

module.exports = {
  requireUser
};
