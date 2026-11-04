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
  amountPaise: {
    type: Number,
    required: true,
    validate: {
      validator: Number.isInteger,
      message: '{VALUE} must be an integer'
    }
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

// Synchronize amount and amountPaise
notificationSchema.pre('validate', function (next) {
  if (this.amountPaise !== undefined && this.amountPaise !== null) {
    if (this.amount === undefined || this.amount === null) {
      this.amount = this.amountPaise / 100;
    }
  } else if (this.amount !== undefined && this.amount !== null) {
    this.amountPaise = Math.round(this.amount * 100);
  }
  next();
});

// Enforce idempotency: unique compound index on userId + transactionId
notificationSchema.index({ userId: 1, transactionId: 1 }, { unique: true });
notificationSchema.index({ userId: 1, createdAt: -1 });

notificationSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  if (typeof this.amountPaise === 'number') {
    obj.amount = this.amountPaise / 100;
  }
  delete obj.amountPaise;
  delete obj.__v;
  return obj;
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
