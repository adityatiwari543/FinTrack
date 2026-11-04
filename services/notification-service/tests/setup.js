const mongoose = require('mongoose');
const Notification = require('../src/models/notification.model');
const Threshold = require('../src/models/threshold.model');

process.env.NODE_ENV = 'test';
process.env.INTERNAL_SERVICE_SECRET = 'test_internal_secret_32_characters';

let memoryNotifications = [];
let memoryThresholds = [];

beforeEach(() => {
  if (process.env.USE_REAL_INFRA === 'true') return;
  memoryNotifications = [];
  memoryThresholds = [];

  // Mock Notification.create
  jest.spyOn(Notification, 'create').mockImplementation((data) => {
    // Check uniqueness of userId + transactionId
    const existing = memoryNotifications.find(n => n.userId === data.userId && n.transactionId === data.transactionId);
    if (existing) {
      const err = new Error('Duplicate key error');
      err.code = 11000;
      return Promise.reject(err);
    }
    const amountPaise = data.amountPaise != null ? data.amountPaise : Math.round((data.amount || 0) * 100);
    const amount = data.amount != null ? data.amount : amountPaise / 100;
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      isRead: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
      amountPaise,
      amount,
      toJSON() {
        return {
          id: this._id.toString(),
          userId: this.userId,
          transactionId: this.transactionId,
          amount: this.amount,
          category: this.category,
          message: this.message,
          isRead: this.isRead,
          createdAt: this.createdAt
        };
      },
      save() {
        return Promise.resolve(this);
      }
    };
    memoryNotifications.push(doc);
    return Promise.resolve(doc);
  });

  // Mock Notification.find
  jest.spyOn(Notification, 'find').mockImplementation((query = {}) => {
    let results = memoryNotifications.filter(n => {
      if (query.userId && n.userId !== query.userId) return false;
      return true;
    });
    return {
      _results: results,
      sort() {
        this._results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return this;
      },
      limit(n) {
        this._results = this._results.slice(0, n);
        return this;
      },
      then(resolve) {
        return Promise.resolve(this._results).then(resolve);
      }
    };
  });

  // Mock Notification.countDocuments
  jest.spyOn(Notification, 'countDocuments').mockImplementation((query = {}) => {
    const results = memoryNotifications.filter(n => {
      if (query.userId && n.userId !== query.userId) return false;
      if (query.isRead !== undefined && n.isRead !== query.isRead) return false;
      return true;
    });
    return Promise.resolve(results.length);
  });

  // Mock Notification.findOne
  jest.spyOn(Notification, 'findOne').mockImplementation((query = {}) => {
    const match = memoryNotifications.find(n => {
      const matchId = query._id ? n._id.toString() === query._id.toString() : true;
      const matchUser = query.userId ? n.userId === query.userId : true;
      return matchId && matchUser;
    });
    return Promise.resolve(match || null);
  });

  // Mock Threshold.findOne
  jest.spyOn(Threshold, 'findOne').mockImplementation((query = {}) => {
    const match = memoryThresholds.find(t => t.userId === query.userId);
    return Promise.resolve(match || null);
  });

  // Mock Threshold.findOneAndUpdate
  jest.spyOn(Threshold, 'findOneAndUpdate').mockImplementation((filter, update) => {
    let match = memoryThresholds.find(t => t.userId === filter.userId);
    const thresholdPaise = update.thresholdPaise != null ? update.thresholdPaise : Math.round((update.threshold || 0) * 100);
    const threshold = update.threshold != null ? update.threshold : thresholdPaise / 100;
    if (!match) {
      match = {
        userId: filter.userId,
        threshold,
        thresholdPaise,
        toJSON() { return { threshold: this.threshold, thresholdPaise: this.thresholdPaise }; }
      };
      memoryThresholds.push(match);
    } else {
      match.threshold = threshold;
      match.thresholdPaise = thresholdPaise;
    }
    return Promise.resolve(match);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});
