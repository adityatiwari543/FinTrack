const User = require('../models/user.model');
const config = require('../config/env');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken
} = require('../utils/token');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Cookie options helper for secure httpOnly refresh token storage
 */
function getCookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: config.cookiePath,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in ms
  };
}

function setRefreshTokenCookie(res, token) {
  res.cookie('refreshToken', token, getCookieOptions());
}

function clearRefreshTokenCookie(res) {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: config.cookiePath
  });
}

/**
 * Register a new user
 */
async function register(req, res, next) {
  try {
    const { name, email, password } = req.validatedBody;

    // Check if user already exists
    const existing = await User.findOne({ email });
    if (existing) {
      return sendError(res, 'An account with this email already exists', 409, null, 'USER_EXISTS');
    }

    const user = new User({ name, email, password });
    await user.save();

    // Generate tokens
    const tokenPayload = { userId: user._id.toString(), email: user.email };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Store hashed refresh token in database
    const tokenHash = hashToken(refreshToken);
    user.refreshTokens.push({ tokenHash });
    await user.save();

    // Set refresh token strictly as httpOnly cookie
    setRefreshTokenCookie(res, refreshToken);

    req.log?.info({ userId: user._id, email: user.email }, 'User registered successfully');

    // Never return refresh token in JSON response
    return sendSuccess(res, {
      user: user.toJSON(),
      accessToken
    }, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * Log in an existing user
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.validatedBody;

    const user = await User.findOne({ email });
    if (!user) {
      return sendError(res, 'Invalid email or password', 401, null, 'INVALID_CREDENTIALS');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return sendError(res, 'Invalid email or password', 401, null, 'INVALID_CREDENTIALS');
    }

    // Generate tokens
    const tokenPayload = { userId: user._id.toString(), email: user.email };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Store hashed refresh token in database
    const tokenHash = hashToken(refreshToken);
    user.refreshTokens.push({ tokenHash });
    await user.save();

    // Set refresh token strictly as httpOnly cookie
    setRefreshTokenCookie(res, refreshToken);

    req.log?.info({ userId: user._id }, 'User logged in successfully');

    // Never return refresh token in JSON response
    return sendSuccess(res, {
      user: user.toJSON(),
      accessToken
    }, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * Refresh access token using refresh token rotation
 */
async function refresh(req, res, next) {
  try {
    // Read refresh token from httpOnly cookie or fallback body
    const refreshToken = req.cookies?.refreshToken || req.validatedBody?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      return sendError(res, 'Refresh token required in cookie', 401, null, 'REFRESH_TOKEN_REQUIRED');
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (tokenErr) {
      clearRefreshTokenCookie(res);
      return sendError(res, 'Invalid or expired refresh token', 401, null, 'INVALID_REFRESH_TOKEN');
    }

    const userId = decoded.userId || decoded.id;
    const user = await User.findById(userId);
    if (!user) {
      clearRefreshTokenCookie(res);
      return sendError(res, 'User not found', 404, null, 'USER_NOT_FOUND');
    }

    const incomingHash = hashToken(refreshToken);
    const tokenIndex = user.refreshTokens.findIndex(rt => rt.tokenHash === incomingHash);

    if (tokenIndex === -1) {
      // Possible token reuse / breach: revoke all refresh tokens for safety
      user.refreshTokens = [];
      await user.save();
      clearRefreshTokenCookie(res);
      return sendError(res, 'Refresh token invalid or already consumed', 401, null, 'TOKEN_REUSE_DETECTED');
    }

    // Remove consumed token (Rotation)
    user.refreshTokens.splice(tokenIndex, 1);

    // Issue new pair
    const tokenPayload = { userId: user._id.toString(), email: user.email };
    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    user.refreshTokens.push({ tokenHash: hashToken(newRefreshToken) });
    await user.save();

    // Replace cookie with newly rotated refresh token
    setRefreshTokenCookie(res, newRefreshToken);

    req.log?.info({ userId: user._id }, 'Token rotated successfully');

    // Return new access token in JSON (never return refresh token in JSON)
    return sendSuccess(res, {
      accessToken: newAccessToken
    }, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * Log out and revoke active session
 */
async function logout(req, res, next) {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (refreshToken) {
      try {
        const incomingHash = hashToken(refreshToken);
        let user = null;

        try {
          const decoded = verifyRefreshToken(refreshToken);
          const userId = decoded.userId || decoded.id;
          if (userId) {
            user = await User.findById(userId);
          }
        } catch (_) {}

        if (!user) {
          user = await User.findOne({ 'refreshTokens.tokenHash': incomingHash });
        }

        if (user) {
          user.refreshTokens = user.refreshTokens.filter(rt => rt.tokenHash !== incomingHash);
          await user.save();
          req.log?.info({ userId: user._id }, 'User session revoked on logout');
        }
      } catch (err) {
        req.log?.warn({ err: err.message }, 'Error revoking token session during logout');
      }
    }

    // Clear refresh-token cookie with matching attributes
    clearRefreshTokenCookie(res);

    return sendSuccess(res, {
      message: 'Logged out successfully'
    }, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * Get current user profile
 */
async function getMe(req, res, next) {
  try {
    return sendSuccess(res, {
      user: req.user.toJSON()
    }, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * Health check
 */
function healthCheck(req, res) {
  return res.status(200).json({
    status: 'ok',
    service: 'auth-service',
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  getMe,
  healthCheck,
  getCookieOptions
};
