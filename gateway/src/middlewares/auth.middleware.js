const jwt = require('jsonwebtoken');
const config = require('../config/env');

function verifyGatewayToken(req, res, next) {
  // Strip untrusted incoming internal headers
  delete req.headers['x-user-id'];
  delete req.headers['x-user-email'];

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Authorization token required',
        code: 'UNAUTHORIZED'
      }
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const userId = decoded.userId || decoded.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Malformed token payload: missing user identifier',
          code: 'INVALID_TOKEN'
        }
      });
    }

    // Securely inject trusted identity headers for downstream microservices
    req.headers['x-user-id'] = userId;
    req.headers['x-user-email'] = decoded.email || '';
    req.user = decoded;

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Access token expired',
          code: 'TOKEN_EXPIRED'
        }
      });
    }

    return res.status(401).json({
      success: false,
      error: {
        message: 'Invalid access token',
        code: 'INVALID_TOKEN'
      }
    });
  }
}

module.exports = {
  verifyGatewayToken
};
