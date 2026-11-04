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
const { setThresholdSchema } = require('../validations/notification.validation');

const router = express.Router();

// Public health check
router.get('/health', healthCheck);

// Protected routes (require user identity injected by gateway)
router.use(requireUser);

router.get('/notifications', getNotifications);
router.patch('/notifications/:id/read', markNotificationAsRead);
router.put('/settings/threshold', validateBody(setThresholdSchema), setThreshold);
router.get('/settings/threshold', getThreshold);

module.exports = router;
