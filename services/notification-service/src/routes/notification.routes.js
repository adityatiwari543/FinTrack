const express = require('express');
const {
  getNotifications,
  markNotificationAsRead,
  setThreshold,
  getThreshold,
  healthCheck
} = require('../controllers/notification.controller');
const { validateBody } = require('../middlewares/validate.middleware');
const { requireUser } = require('../middlewares/user.middleware');
const { verifyInternalToken } = require('../middlewares/internalAuth.middleware');
const { setThresholdSchema } = require('../validations/notification.validation');

const router = express.Router();

// Public health check
router.get('/health', healthCheck);

// Internal microservice routes (must be proxied via API Gateway)
router.use(verifyInternalToken);

// Protected routes (require user identity injected by gateway)
router.use(requireUser);

router.get(['/', '/notifications'], getNotifications);
router.patch(['/:id/read', '/notifications/:id/read'], markNotificationAsRead);
router.put(['/threshold', '/settings/threshold'], validateBody(setThresholdSchema), setThreshold);
router.get(['/threshold', '/settings/threshold'], getThreshold);

module.exports = router;
