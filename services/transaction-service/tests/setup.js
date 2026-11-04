const mongoose = require('mongoose');
const Transaction = require('../src/models/transaction.model');

process.env.NODE_ENV = 'test';
process.env.INTERNAL_SERVICE_SECRET = 'test_internal_secret_32_characters';

let memoryTransactions = [];

beforeEach(() => {
  if (process.env.USE_REAL_INFRA === 'true') return;
  memoryTransactions = [];

  // Mock save
  jest.spyOn(Transaction.prototype, 'save').mockImplementation(async function () {
    if (!this._id) {
      this._id = new mongoose.Types.ObjectId();
    }
    if (this.amountPaise !== undefined && this.amountPaise !== null) {
      if (this.amount === undefined || this.amount === null) {
        this.amount = this.amountPaise / 100;
      }
    } else if (this.amount !== undefined && this.amount !== null) {
      this.amountPaise = Math.round(this.amount * 100);
    }
    const idx = memoryTransactions.findIndex(t => t._id.toString() === this._id.toString());
    if (idx >= 0) {
      memoryTransactions[idx] = this;
    } else {
      memoryTransactions.push(this);
    }
    return this;
  });

  // Mock find
  jest.spyOn(Transaction, 'find').mockImplementation((filter = {}) => {
    let results = [...memoryTransactions];

    if (filter.userId) {
      results = results.filter(t => t.userId === filter.userId);
    }
    if (filter.type) {
      results = results.filter(t => t.type === filter.type);
    }
    if (filter.category) {
      const reg = filter.category instanceof RegExp ? filter.category : new RegExp(`^${filter.category}$`, 'i');
      results = results.filter(t => reg.test(t.category));
    }
    if (filter.date && filter.date.$gte && filter.date.$lt) {
      results = results.filter(t => new Date(t.date) >= filter.date.$gte && new Date(t.date) < filter.date.$lt);
    }

    const queryObj = {
      _results: results,
      sort(criteria) {
        this._results.sort((a, b) => new Date(b.date) - new Date(a.date));
        return this;
      },
      skip(count) {
        this._results = this._results.slice(count);
        return this;
      },
      limit(count) {
        this._results = this._results.slice(0, count);
        return this;
      },
      then(resolve) {
        return Promise.resolve(this._results).then(resolve);
      }
    };
    return queryObj;
  });

  // Mock countDocuments
  jest.spyOn(Transaction, 'countDocuments').mockImplementation((filter = {}) => {
    let results = [...memoryTransactions];
    if (filter.userId) results = results.filter(t => t.userId === filter.userId);
    if (filter.type) results = results.filter(t => t.type === filter.type);
    if (filter.category) {
      const reg = filter.category instanceof RegExp ? filter.category : new RegExp(`^${filter.category}$`, 'i');
      results = results.filter(t => reg.test(t.category));
    }
    if (filter.date && filter.date.$gte && filter.date.$lt) {
      results = results.filter(t => new Date(t.date) >= filter.date.$gte && new Date(t.date) < filter.date.$lt);
    }
    return Promise.resolve(results.length);
  });

  // Mock findOne
  jest.spyOn(Transaction, 'findOne').mockImplementation((query) => {
    const match = memoryTransactions.find(t => {
      const matchId = query._id ? t._id.toString() === query._id.toString() : true;
      const matchUser = query.userId ? t.userId === query.userId : true;
      return matchId && matchUser;
    });
    return Promise.resolve(match || null);
  });

  // Mock findOneAndDelete
  jest.spyOn(Transaction, 'findOneAndDelete').mockImplementation((query) => {
    const idx = memoryTransactions.findIndex(t => {
      const matchId = query._id ? t._id.toString() === query._id.toString() : true;
      const matchUser = query.userId ? t.userId === query.userId : true;
      return matchId && matchUser;
    });
    if (idx >= 0) {
      const removed = memoryTransactions.splice(idx, 1)[0];
      return Promise.resolve(removed);
    }
    return Promise.resolve(null);
  });

  // Mock aggregate
  jest.spyOn(Transaction, 'aggregate').mockImplementation((pipeline = []) => {
    const matchStage = pipeline[0]?.$match || {};
    let filtered = [...memoryTransactions];

    if (matchStage.userId) filtered = filtered.filter(t => t.userId === matchStage.userId);
    if (matchStage.type) filtered = filtered.filter(t => t.type === matchStage.type);
    if (matchStage.date && matchStage.date.$gte && matchStage.date.$lt) {
      filtered = filtered.filter(t => new Date(t.date) >= matchStage.date.$gte && new Date(t.date) < matchStage.date.$lt);
    }

    const groupStage = pipeline[1]?.$group;
    if (groupStage) {
      const groupField = groupStage._id.replace('$', '');
      const groups = {};
      filtered.forEach(item => {
        const key = item[groupField];
        if (!groups[key]) {
          groups[key] = { _id: key, totalAmount: 0, totalAmountPaise: 0, count: 0 };
        }
        const paise = typeof item.amountPaise === 'number' ? item.amountPaise : Math.round(item.amount * 100);
        groups[key].totalAmountPaise += paise;
        groups[key].totalAmount = groups[key].totalAmountPaise / 100;
        groups[key].count += 1;
      });
      return Promise.resolve(Object.values(groups));
    }

    return Promise.resolve([]);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});
