const express = require('express');
const {
  register,
  login,
  refresh,
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

const router = express.Router();

router.get('/health', healthCheck);
router.post('/register', validateBody(registerSchema), register);
router.post('/login', validateBody(loginSchema), login);
router.post('/refresh', validateBody(refreshSchema), refresh);
router.get('/me', authenticate, getMe);

module.exports = router;
