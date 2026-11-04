const request = require('supertest');
const app = require('../src/app');
const { processExpenseEvent } = require('../src/services/eventConsumer');
const { toPaise, toRupees } = require('../src/utils/currency');
const Notification = require('../src/models/notification.model');
const Threshold = require('../src/models/threshold.model');

describe('Notification Service Monetary Precision & Threshold Tests (Phase B4)', () => {
  const internalSecret = 'test_internal_secret_32_characters';
  const userId = 'user_672b1234567890abcdefc5c5';

  describe('Threshold Currency Conversions & Validation', () => {
    it('Scenario 1: Converts ₹10,000 threshold to 1,000,000 paise', () => {
      expect(toPaise(10000, true)).toBe(1000000);
      expect(toRupees(1000000)).toBe(10000);
    });

    it('Scenario 7: Rejects threshold with more than 2 decimal places (e.g. 10000.555)', async () => {
      const res = await request(app)
        .put('/settings/threshold')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', userId)
        .send({ threshold: 10000.555 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('Scenario 14: Threshold API returns INR decimal rather than exposing paise', async () => {
      const putRes = await request(app)
        .put('/settings/threshold')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', userId)
        .send({ threshold: 15000.50 });

      expect(putRes.status).toBe(200);
      expect(putRes.body.data.threshold).toBe(15000.50);

      const getRes = await request(app)
        .get('/settings/threshold')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', userId);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.threshold).toBe(15000.50);
    });
  });

  describe('Threshold Comparison & Boundary Conditions (Scenarios 12 & 13)', () => {
    beforeEach(async () => {
      // Set threshold to exactly ₹10,000 (1,000,000 paise)
      await request(app)
        .put('/settings/threshold')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', userId)
        .send({ threshold: 10000 });
    });

    it('Scenario 13: Sub-boundary expense (₹9,999.99 = 999999 paise) does NOT trigger notification', async () => {
      const result = await processExpenseEvent({
        event: 'EXPENSE_CREATED',
        transactionId: 'tx_sub_boundary',
        userId,
        amount: 9999.99,
        amountPaise: 999999,
        category: 'Shopping'
      });

      expect(result.processed).toBe(true);
      expect(result.created).toBe(false);
      expect(result.thresholdExceeded).toBe(false);

      const found = await Notification.findOne({ transactionId: 'tx_sub_boundary' });
      expect(found).toBeNull();
    });

    it('Scenario 12 & 13: Exact boundary expense (₹10,000.00 = 1,000,000 paise) DOES trigger notification', async () => {
      const result = await processExpenseEvent({
        event: 'EXPENSE_CREATED',
        transactionId: 'tx_exact_boundary',
        userId,
        amount: 10000,
        amountPaise: 1000000,
        category: 'Electronics'
      });

      expect(result.processed).toBe(true);
      expect(result.created).toBe(true);

      const notif = await Notification.findOne({ transactionId: 'tx_exact_boundary' });
      expect(notif).toBeDefined();
      expect(notif.amount).toBe(10000);
      expect(notif.message).toContain('₹10,000');
    });

    it('Scenario 13: Super-boundary expense (₹10,000.01 = 1,000,001 paise) DOES trigger notification', async () => {
      const result = await processExpenseEvent({
        event: 'EXPENSE_CREATED',
        transactionId: 'tx_super_boundary',
        userId,
        amount: 10000.01,
        amountPaise: 1000001,
        category: 'Apparel'
      });

      expect(result.processed).toBe(true);
      expect(result.created).toBe(true);

      const notif = await Notification.findOne({ transactionId: 'tx_super_boundary' });
      expect(notif).toBeDefined();
      expect(notif.amount).toBe(10000.01);
    });

    it('Scenario 14: Notification API returns INR amount and hides internal amountPaise', async () => {
      await processExpenseEvent({
        event: 'EXPENSE_CREATED',
        transactionId: 'tx_notif_format_check',
        userId,
        amount: 15000.75,
        amountPaise: 1500075,
        category: 'Travel'
      });

      const res = await request(app)
        .get('/notifications')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', userId);

      expect(res.status).toBe(200);
      const notifications = res.body.data.notifications;
      expect(notifications.length).toBeGreaterThan(0);
      const found = notifications.find(n => n.transactionId === 'tx_notif_format_check');
      expect(found).toBeDefined();
      expect(found.amount).toBe(15000.75);
      expect(found.amountPaise).toBeUndefined(); // ensure internal paise is not exposed
    });
  });
});
