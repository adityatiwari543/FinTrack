const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  transactionId: {
    type: String,
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});

// Enforce idempotency: unique compound index on userId + transactionId
notificationSchema.index({ userId: 1, transactionId: 1 }, { unique: true });
notificationSchema.index({ userId: 1, createdAt: -1 });

notificationSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj.__v;
  return obj;
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
