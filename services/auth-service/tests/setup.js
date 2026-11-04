const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../src/models/user.model');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key_1234567890123456';
process.env.REFRESH_TOKEN_SECRET = 'test_refresh_token_secret_1234567890123456';

// In-memory data store for tests
let memoryUsers = [];

beforeEach(() => {
  memoryUsers = [];

  // Mock User.findOne
  jest.spyOn(User, 'findOne').mockImplementation((query) => {
    let match = null;
    if (query.email) {
      match = memoryUsers.find(u => u.email === query.email.toLowerCase());
    }
    return Promise.resolve(match || null);
  });

  // Mock User.findById
  jest.spyOn(User, 'findById').mockImplementation((id) => {
    const match = memoryUsers.find(u => u._id.toString() === id.toString());
    return Promise.resolve(match || null);
  });

  // Mock User constructor save
  jest.spyOn(User.prototype, 'save').mockImplementation(async function () {
    if (!this._id) {
      this._id = new mongoose.Types.ObjectId();
    }
    if (this.password && !this.password.startsWith('$2')) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }
    const idx = memoryUsers.findIndex(u => u._id.toString() === this._id.toString());
    if (idx >= 0) {
      memoryUsers[idx] = this;
    } else {
      memoryUsers.push(this);
    }
    return this;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});
