const mongoose = require('mongoose');
const Notification = require('../models/notification.model');
const Threshold = require('../models/threshold.model');
const config = require('../config/env');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Get user's notifications (sorted latest first)
 */
async function getNotifications(req, res, next) {
  try {
    const userId = req.userId;

    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ userId }).sort({ createdAt: -1 }).limit(50),
      Notification.countDocuments({ userId, isRead: false })
    ]);

    return sendSuccess(res, {
      notifications: notifications.map(n => n.toJSON()),
      unreadCount
    }, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * Mark a notification as read (ownership verified)
 */
async function markNotificationAsRead(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 'Invalid notification ID format', 400, null, 'INVALID_ID');
    }

    const notification = await Notification.findOne({ _id: id, userId });
    if (!notification) {
      return sendError(res, 'Notification not found', 404, null, 'NOT_FOUND');
    }

    notification.isRead = true;
    await notification.save();

    return sendSuccess(res, { notification: notification.toJSON() }, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * Set user's expense alert threshold
 */
async function setThreshold(req, res, next) {
  try {
    const userId = req.userId;
    const { threshold } = req.validatedBody;

    const setting = await Threshold.findOneAndUpdate(
      { userId },
      { threshold },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    req.log?.info({ userId, threshold }, 'Expense alert threshold updated');

    return sendSuccess(res, {
      threshold: setting.threshold
    }, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * Get user's expense alert threshold
 */
async function getThreshold(req, res, next) {
  try {
    const userId = req.userId;
    const setting = await Threshold.findOne({ userId });

    return sendSuccess(res, {
      threshold: setting ? setting.threshold : config.defaultAlertThreshold
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
    service: 'notification-service',
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  getNotifications,
  markNotificationAsRead,
  setThreshold,
  getThreshold,
  healthCheck
};
