const express = require('express');
const {
  register,
  login,
  refresh,
  logout,
  getMe,
  healthCheck
} = require('../controllers/auth.controller');
const { validateBody } = require('../middlewares/validate.middleware');
const {
  registerSchema,
  loginSchema,
  refreshSchema
} = require('../validations/auth.validation');
const { authenticate } = require('../middlewares/auth.middleware');
const { verifyInternalToken } = require('../middlewares/internalAuth.middleware');

const router = express.Router();

// Public health check for Docker/monitoring
router.get('/health', healthCheck);

// Internal microservice routes (must be proxied via API Gateway)
router.use(verifyInternalToken);

router.post('/register', validateBody(registerSchema), register);
router.post('/login', validateBody(loginSchema), login);
router.post('/refresh', validateBody(refreshSchema), refresh);
router.post('/logout', logout);
router.get('/me', authenticate, getMe);

module.exports = router;
