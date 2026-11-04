const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/env');

function generateAccessToken(payload) {
  return jwt.sign({
    ...payload,
    jti: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')
  }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  });
}

function generateRefreshToken(payload) {
  return jwt.sign({
    ...payload,
    jti: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')
  }, config.refreshTokenSecret, {
    expiresIn: config.refreshTokenExpiresIn
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, config.refreshTokenSecret);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken
};
