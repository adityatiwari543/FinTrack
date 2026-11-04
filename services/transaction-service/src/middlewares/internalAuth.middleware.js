const crypto = require('crypto');
const config = require('../config/env');
const { sendError } = require('../utils/response');

function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyInternalToken(req, res, next) {
  const token = req.headers['x-internal-token'];

  if (!token) {
    return sendError(res, 'Direct microservice access denied: missing internal token', 403, null, 'FORBIDDEN_DIRECT_ACCESS');
  }

  if (!config.internalServiceSecret || !timingSafeCompare(token, config.internalServiceSecret)) {
    return sendError(res, 'Direct microservice access denied: invalid internal token', 403, null, 'INVALID_INTERNAL_TOKEN');
  }

  next();
}

module.exports = {
  verifyInternalToken
};
