const request = require('supertest');
const app = require('../src/app');
const { toPaise, toRupees, formatINR } = require('../src/utils/currency');
const Transaction = require('../src/models/transaction.model');

describe('Monetary Precision & Integer Paise Tests (Phase B4)', () => {
  const internalSecret = 'test_internal_secret_32_characters';
  const userId = 'user_672b1234567890abcdefb4b4';

  describe('Unit Conversion: toPaise and toRupees (Scenarios 1 - 7)', () => {
    it('Scenario 1: ₹1 converts to 100 paise', () => {
      expect(toPaise(1)).toBe(100);
      expect(toRupees(100)).toBe(1);
    });

    it('Scenario 2: ₹10.50 converts to 1050 paise', () => {
      expect(toPaise(10.50)).toBe(1050);
      expect(toPaise('10.50')).toBe(1050);
      expect(toRupees(1050)).toBe(10.5);
    });

    it('Scenario 3: ₹100.75 converts to 10075 paise', () => {
      expect(toPaise(100.75)).toBe(10075);
      expect(toPaise('100.75')).toBe(10075);
      expect(toRupees(10075)).toBe(100.75);
    });

    it('Scenario 4: ₹1,250.75 converts to 125075 paise', () => {
      expect(toPaise(1250.75)).toBe(125075);
      expect(toPaise('1250.75')).toBe(125075);
      expect(toRupees(125075)).toBe(1250.75);
    });

    it('Scenario 5: Invalid negative amounts are rejected', () => {
      expect(() => toPaise(-50)).toThrow(RangeError);
      expect(() => toPaise(-0.01)).toThrow(RangeError);
    });

    it('Scenario 6: Zero amounts follow validation policy (rejected for transactions)', () => {
      expect(() => toPaise(0, false)).toThrow(RangeError);
      expect(toPaise(0, true)).toBe(0); // Allowed when allowZero=true (e.g. Thresholds)
    });

    it('Scenario 7: More than two decimal places are rejected', () => {
      expect(() => toPaise(10.555)).toThrow('Amount cannot have more than 2 decimal places');
      expect(() => toPaise('12.999')).toThrow('Amount cannot have more than 2 decimal places');
    });

    it('Safe integer boundaries are enforced', () => {
      expect(() => toPaise(1e16)).toThrow(RangeError);
      expect(() => toRupees(Number.MAX_SAFE_INTEGER + 10)).toThrow(TypeError);
    });
  });

  describe('API Precision Validation & INR Compatibility (Scenarios 5, 6, 7, 14)', () => {
    it('Scenario 5 & 6: Rejects negative and zero amounts via POST /transactions', async () => {
      const negativeRes = await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', userId)
        .send({
          amount: -50,
          type: 'expense',
          category: 'Bills'
        });
      expect(negativeRes.status).toBe(400);
      expect(negativeRes.body.error.code).toBe('VALIDATION_ERROR');

      const zeroRes = await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', userId)
        .send({
          amount: 0,
          type: 'expense',
          category: 'Bills'
        });
      expect(zeroRes.status).toBe(400);
      expect(zeroRes.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('Scenario 7: Rejects amount with more than 2 decimal places (e.g. 10.555) via API', async () => {
      const res = await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', userId)
        .send({
          amount: 10.555,
          type: 'expense',
          category: 'Food'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some(d => d.message.includes('2 decimal places'))).toBe(true);
    });

    it('Scenario 14: API responses return INR rather than exposing paise', async () => {
      const res = await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', userId)
        .send({
          amount: 1250.75,
          type: 'expense',
          category: 'Electronics',
          date: '2026-11-04T10:00:00.000Z',
          note: 'Wireless mouse'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      // Response amount must be in INR (1250.75), not paise (125075)
      expect(res.body.data.transaction.amount).toBe(1250.75);
      expect(res.body.data.transaction.amountPaise).toBeUndefined(); // internal field not leaked

      // Verify GET returns INR
      const getRes = await request(app)
        .get(`/transactions/${res.body.data.transaction.id}`)
        .set('x-internal-token', internalSecret)
        .set('x-user-id', userId);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.transaction.amount).toBe(1250.75);
    });
  });

  describe('Financial Aggregations with Canonical Integer Paise (Scenarios 8 - 11)', () => {
    beforeEach(async () => {
      // Income 1: ₹50,000.50 (5000050 paise)
      await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', userId)
        .send({
          amount: 50000.50,
          type: 'income',
          category: 'Salary',
          date: '2026-11-01T00:00:00.000Z'
        });

      // Income 2: ₹25,000.25 (2500025 paise)
      await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', userId)
        .send({
          amount: 25000.25,
          type: 'income',
          category: 'Consulting',
          date: '2026-11-02T00:00:00.000Z'
        });

      // Expense 1: ₹12,500.25 (1250025 paise)
      await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', userId)
        .send({
          amount: 12500.25,
          type: 'expense',
          category: 'Rent',
          date: '2026-11-03T00:00:00.000Z'
        });

      // Expense 2: ₹7,500.50 (750050 paise)
      await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', userId)
        .send({
          amount: 7500.50,
          type: 'expense',
          category: 'Groceries',
          date: '2026-11-04T00:00:00.000Z'
        });
    });

    it('Scenario 8, 9, 10: Monthly income, expense, and balance calculations avoid floating-point drift', async () => {
      const res = await request(app)
        .get('/transactions/summary?month=2026-11')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', userId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Expected Incomes: 50000.50 + 25000.25 = 75000.75
      expect(res.body.data.totalIncome).toBe(75000.75);

      // Expected Expenses: 12500.25 + 7500.50 = 20000.75
      expect(res.body.data.totalExpense).toBe(20000.75);

      // Expected Balance: 75000.75 - 20000.75 = 55000 (Exact, no IEEE 754 float drift)
      expect(res.body.data.balance).toBe(55000);
    });

    it('Scenario 11: Category breakdown aggregation sums accurately in paise', async () => {
      const res = await request(app)
        .get('/transactions/summary?month=2026-11')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', userId);

      expect(res.status).toBe(200);
      const breakdown = res.body.data.categoryBreakdown;
      expect(breakdown.length).toBe(2);

      const rent = breakdown.find(b => b.category === 'Rent');
      const groceries = breakdown.find(b => b.category === 'Groceries');

      expect(rent.amount).toBe(12500.25);
      expect(groceries.amount).toBe(7500.50);

      // Total percentage check
      expect(rent.percentage + groceries.percentage).toBeCloseTo(100, 1);
    });

    it('Handles negative balance cleanly when expenses exceed income', async () => {
      // Add large expense: ₹100,000
      await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', userId)
        .send({
          amount: 100000,
          type: 'expense',
          category: 'Medical',
          date: '2026-11-05T00:00:00.000Z'
        });

      const res = await request(app)
        .get('/transactions/summary?month=2026-11')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', userId);

      expect(res.status).toBe(200);
      // Income: 75000.75, Expenses: 120000.75, Balance: -45000
      expect(res.body.data.balance).toBe(-45000);
    });
  });
});
