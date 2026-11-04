const mongoose = require('mongoose');
const Notification = require('../models/notification.model');
const Threshold = require('../models/threshold.model');
const config = require('../config/env');
const { sendSuccess, sendError } = require('../utils/response');
const { toPaise, toRupees } = require('../utils/currency');

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
 * Input threshold is in INR, stored internally as integer thresholdPaise
 */
async function setThreshold(req, res, next) {
  try {
    const userId = req.userId;
    const { threshold } = req.validatedBody;

    const thresholdPaise = toPaise(threshold, true);

    const setting = await Threshold.findOneAndUpdate(
      { userId },
      { thresholdPaise, threshold },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    req.log?.info({ userId, threshold, thresholdPaise }, 'Expense alert threshold updated');

    const returnedThreshold = typeof setting.thresholdPaise === 'number'
      ? toRupees(setting.thresholdPaise)
      : setting.threshold;

    return sendSuccess(res, {
      threshold: returnedThreshold
    }, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * Get user's expense alert threshold (returns INR value)
 */
async function getThreshold(req, res, next) {
  try {
    const userId = req.userId;
    const setting = await Threshold.findOne({ userId });

    let thresholdVal = config.defaultAlertThreshold;
    if (setting) {
      thresholdVal = typeof setting.thresholdPaise === 'number'
        ? toRupees(setting.thresholdPaise)
        : setting.threshold;
    }

    return sendSuccess(res, {
      threshold: thresholdVal
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
