const { verifyAccessToken } = require('../utils/token');
const { sendError } = require('../utils/response');
const User = require('../models/user.model');

async function authenticate(req, res, next) {
  try {
    let userId = req.headers['x-user-id'];

    if (!userId) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return sendError(res, 'Authentication required', 401, null, 'UNAUTHORIZED');
      }

      const token = authHeader.split(' ')[1];
      const decoded = verifyAccessToken(token);
      userId = decoded.userId || decoded.id;
    }

    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, 'User not found', 404, null, 'USER_NOT_FOUND');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return sendError(res, 'Token has expired', 401, null, 'TOKEN_EXPIRED');
    }
    return sendError(res, 'Invalid or malformed token', 401, null, 'INVALID_TOKEN');
  }
}

module.exports = {
  authenticate
};
