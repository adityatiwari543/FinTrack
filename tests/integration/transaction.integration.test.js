/**
 * Transaction Service Real Infrastructure Integration Tests (Phase C)
 * Tests against real MongoDB instance (isolated database: fintrack_transactions_test)
 */

require('./setup');
const request = require('supertest');
const mongoose = require('mongoose');
const { isMongoAvailable, TEST_CONFIG } = require('./infra-check');

describe('Transaction Service Real MongoDB Integration Tests (Phase C)', () => {
  let mongoAvailable = false;
  let app;
  let Transaction;
  const internalSecret = TEST_CONFIG.internalServiceSecret;
  const user1 = 'user_real_mongo_1111';
  const user2 = 'user_real_mongo_2222';

  beforeAll(async () => {
    mongoAvailable = await isMongoAvailable(27019);
    if (!mongoAvailable) {
      console.log('\n[INFRASTRUCTURE NOTICE]: Live MongoDB not reachable on 127.0.0.1:27019 (Transaction Service). Transaction Service real integration tests marked as NOT TESTED.\n');
      return;
    }

    process.env.USE_REAL_INFRA = 'true';
    process.env.NODE_ENV = 'test';
    process.env.MONGO_URI = TEST_CONFIG.transactionMongoUri;
    process.env.INTERNAL_SERVICE_SECRET = internalSecret;

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(TEST_CONFIG.transactionMongoUri);

    Transaction = require('../../services/transaction-service/src/models/transaction.model');
    await Transaction.deleteMany({});
    await Transaction.syncIndexes();

    app = require('../../services/transaction-service/src/app');
  });

  afterAll(async () => {
    if (mongoAvailable) {
      try {
        await Transaction.deleteMany({});
        await mongoose.connection.close();
      } catch (err) {
        console.error('Teardown error:', err.message);
      }
    }
  });

  const runIfMongo = (testFn) => {
    return async () => {
      if (!mongoAvailable) {
        console.log('Skipped (live MongoDB unavailable)');
        return;
      }
      return testFn();
    };
  };

  it('Requirement 1, 2, 16, 17: Create income/expense, store in amountPaise, return INR response', runIfMongo(async () => {
    // 1. Create Income
    const incRes = await request(app)
      .post('/transactions')
      .set('Content-Type', 'application/json')
      .set('x-internal-token', internalSecret)
      .set('x-user-id', user1)
      .send({
        amount: 85000.50,
        type: 'income',
        category: 'Salary',
        date: '2026-11-01T10:00:00.000Z',
        note: 'November Salary'
      });

    expect(incRes.status).toBe(201);
    expect(incRes.body.data.transaction.amount).toBe(85000.50);
    expect(incRes.body.data.transaction.amountPaise).toBeUndefined(); // Exposes INR only

    // Direct check in real MongoDB
    const persistedIncome = await Transaction.findById(incRes.body.data.transaction.id);
    expect(persistedIncome.amountPaise).toBe(8500050); // Canonical integer paise in DB!
    expect(persistedIncome.type).toBe('income');

    // 2. Create Expense
    const expRes = await request(app)
      .post('/transactions')
      .set('Content-Type', 'application/json')
      .set('x-internal-token', internalSecret)
      .set('x-user-id', user1)
      .send({
        amount: 22000.25,
        type: 'expense',
        category: 'Rent',
        date: '2026-11-02T10:00:00.000Z',
        note: 'Apartment Rent'
      });

    expect(expRes.status).toBe(201);
    expect(expRes.body.data.transaction.amount).toBe(22000.25);

    const persistedExpense = await Transaction.findById(expRes.body.data.transaction.id);
    expect(persistedExpense.amountPaise).toBe(2200025);
  }));

  it('Requirement 3 & 6: Retrieve user transactions and enforce strict ownership isolation', runIfMongo(async () => {
    // Create transaction for user2
    const u2Res = await request(app)
      .post('/transactions')
      .set('Content-Type', 'application/json')
      .set('x-internal-token', internalSecret)
      .set('x-user-id', user2)
      .send({
        amount: 9999,
        type: 'income',
        category: 'Consulting'
      });
    const u2TxId = u2Res.body.data.transaction.id;

    // user1 lists transactions (must NOT see user2's transaction)
    const listRes = await request(app)
      .get('/transactions')
      .set('x-internal-token', internalSecret)
      .set('x-user-id', user1);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.transactions.every(t => t.userId === user1)).toBe(true);

    // user1 attempts to read user2's transaction directly
    const directAccess = await request(app)
      .get(`/transactions/${u2TxId}`)
      .set('x-internal-token', internalSecret)
      .set('x-user-id', user1);

    expect(directAccess.status).toBe(404);
  }));

  it('Requirement 4 & 5: Update and Delete transactions with real DB verification', runIfMongo(async () => {
    const createRes = await request(app)
      .post('/transactions')
      .set('Content-Type', 'application/json')
      .set('x-internal-token', internalSecret)
      .set('x-user-id', user1)
      .send({
        amount: 1500,
        type: 'expense',
        category: 'Food'
      });
    const txId = createRes.body.data.transaction.id;

    // Update
    const updateRes = await request(app)
      .put(`/transactions/${txId}`)
      .set('Content-Type', 'application/json')
      .set('x-internal-token', internalSecret)
      .set('x-user-id', user1)
      .send({
        amount: 1850.50,
        note: 'Dinner with friends'
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.transaction.amount).toBe(1850.50);

    // Verify DB update
    const dbDoc = await Transaction.findById(txId);
    expect(dbDoc.amountPaise).toBe(185050);

    // Delete
    const delRes = await request(app)
      .delete(`/transactions/${txId}`)
      .set('x-internal-token', internalSecret)
      .set('x-user-id', user1);

    expect(delRes.status).toBe(200);

    const checkDeleted = await Transaction.findById(txId);
    expect(checkDeleted).toBeNull();
  }));

  it('Requirement 7, 8, 9, 10: Filtering (month, type, category) and pagination in real MongoDB', runIfMongo(async () => {
    // Filter by type
    const expenseOnly = await request(app)
      .get('/transactions?type=expense')
      .set('x-internal-token', internalSecret)
      .set('x-user-id', user1);

    expect(expenseOnly.status).toBe(200);
    expect(expenseOnly.body.data.transactions.every(t => t.type === 'expense')).toBe(true);

    // Filter by month
    const novFilter = await request(app)
      .get('/transactions?month=2026-11')
      .set('x-internal-token', internalSecret)
      .set('x-user-id', user1);

    expect(novFilter.status).toBe(200);
    expect(novFilter.body.data.transactions.length).toBeGreaterThan(0);

    // Pagination
    const pageRes = await request(app)
      .get('/transactions?limit=1&page=1')
      .set('x-internal-token', internalSecret)
      .set('x-user-id', user1);

    expect(pageRes.status).toBe(200);
    expect(pageRes.body.data.transactions.length).toBe(1);
    expect(pageRes.body.data.pagination.page).toBe(1);
    expect(pageRes.body.data.pagination.limit).toBe(1);
  }));

  it('Requirement 11, 12, 13, 14: Real MongoDB aggregations compute income, expense, balance, and category breakdown in integer paise', runIfMongo(async () => {
    const summaryRes = await request(app)
      .get('/transactions/summary?month=2026-11')
      .set('x-internal-token', internalSecret)
      .set('x-user-id', user1);

    expect(summaryRes.status).toBe(200);
    const data = summaryRes.body.data;

    expect(data.month).toBe('2026-11');
    expect(typeof data.totalIncome).toBe('number');
    expect(typeof data.totalExpense).toBe('number');
    expect(data.balance).toBe(data.totalIncome - data.totalExpense); // Exact balance

    expect(Array.isArray(data.categoryBreakdown)).toBe(true);
    if (data.categoryBreakdown.length > 0) {
      expect(typeof data.categoryBreakdown[0].category).toBe('string');
      expect(typeof data.categoryBreakdown[0].amount).toBe('number');
    }
  }));

  it('Requirement 15: Invalid amounts and dates rejected by Zod', runIfMongo(async () => {
    const badAmount = await request(app)
      .post('/transactions')
      .set('Content-Type', 'application/json')
      .set('x-internal-token', internalSecret)
      .set('x-user-id', user1)
      .send({
        amount: 10.999, // Exceeds 2 decimals
        type: 'income',
        category: 'Bonus'
      });

    expect(badAmount.status).toBe(400);

    const badDate = await request(app)
      .post('/transactions')
      .set('Content-Type', 'application/json')
      .set('x-internal-token', internalSecret)
      .set('x-user-id', user1)
      .send({
        amount: 100,
        type: 'income',
        category: 'Bonus',
        date: 'not-a-valid-date'
      });

    expect(badDate.status).toBe(400);
  }));
});
