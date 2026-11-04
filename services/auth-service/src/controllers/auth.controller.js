const User = require('../models/user.model');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken
} = require('../utils/token');
const { sendSuccess, sendError } = require('../utils/response');

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

    // Store hashed refresh token
    const tokenHash = hashToken(refreshToken);
    user.refreshTokens.push({ tokenHash });
    await user.save();

    req.log?.info({ userId: user._id, email: user.email }, 'User registered successfully');

    return sendSuccess(res, {
      user: user.toJSON(),
      accessToken,
      refreshToken
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

    // Store hashed refresh token
    const tokenHash = hashToken(refreshToken);
    user.refreshTokens.push({ tokenHash });
    await user.save();

    req.log?.info({ userId: user._id }, 'User logged in successfully');

    return sendSuccess(res, {
      user: user.toJSON(),
      accessToken,
      refreshToken
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
    const { refreshToken } = req.validatedBody;

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (tokenErr) {
      return sendError(res, 'Invalid or expired refresh token', 401, null, 'INVALID_REFRESH_TOKEN');
    }

    const userId = decoded.userId || decoded.id;
    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, 'User not found', 404, null, 'USER_NOT_FOUND');
    }

    const incomingHash = hashToken(refreshToken);
    const tokenIndex = user.refreshTokens.findIndex(rt => rt.tokenHash === incomingHash);

    if (tokenIndex === -1) {
      // Possible token reuse / breach: clear all refresh tokens for safety
      user.refreshTokens = [];
      await user.save();
      return sendError(res, 'Refresh token invalid or already consumed', 401, null, 'TOKEN_REUSE_DETECTED');
    }

    // Remove consumed token
    user.refreshTokens.splice(tokenIndex, 1);

    // Issue new pair (Token Rotation)
    const tokenPayload = { userId: user._id.toString(), email: user.email };
    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    user.refreshTokens.push({ tokenHash: hashToken(newRefreshToken) });
    await user.save();

    req.log?.info({ userId: user._id }, 'Token rotated successfully');

    return sendSuccess(res, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
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
  getMe,
  healthCheck
};
