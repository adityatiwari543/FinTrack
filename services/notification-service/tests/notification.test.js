const request = require('supertest');
const app = require('../src/app');
const { processExpenseEvent } = require('../src/services/eventConsumer');
const Notification = require('../src/models/notification.model');

describe('Notification Service API & Consumer Tests', () => {
  const user1 = 'user_672b1234567890abcdef1111';
  const user2 = 'user_672b1234567890abcdef2222';

  describe('GET /health', () => {
    it('should return service name and status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('notification-service');
    });
  });

  describe('Authentication Check', () => {
    it('should reject request without x-user-id header with 401', async () => {
      const res = await request(app).get('/notifications');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Threshold Settings API', () => {
    it('should return default threshold if none configured', async () => {
      const res = await request(app)
        .get('/settings/threshold')
        .set('x-user-id', user1);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.threshold).toBe(10000);
    });

    it('should successfully update user threshold', async () => {
      const res = await request(app)
        .put('/settings/threshold')
        .set('x-user-id', user1)
        .send({ threshold: 25000 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.threshold).toBe(25000);

      const check = await request(app)
        .get('/settings/threshold')
        .set('x-user-id', user1);
      expect(check.body.data.threshold).toBe(25000);
    });

    it('should reject negative threshold value', async () => {
      const res = await request(app)
        .put('/settings/threshold')
        .set('x-user-id', user1)
        .send({ threshold: -500 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Event Consumer & Idempotency', () => {
    it('should NOT create notification if expense is below threshold', async () => {
      await processExpenseEvent({
        event: 'EXPENSE_CREATED',
        transactionId: 'tx_101',
        userId: user1,
        amount: 5000,
        category: 'Food'
      });

      const count = await Notification.countDocuments({ userId: user1 });
      expect(count).toBe(0);
    });

    it('should create notification if expense meets or exceeds threshold', async () => {
      await processExpenseEvent({
        event: 'EXPENSE_CREATED',
        transactionId: 'tx_102',
        userId: user1,
        amount: 15000,
        category: 'Electronics'
      });

      const res = await request(app)
        .get('/notifications')
        .set('x-user-id', user1);

      expect(res.status).toBe(200);
      expect(res.body.data.notifications.length).toBe(1);
      expect(res.body.data.unreadCount).toBe(1);
      expect(res.body.data.notifications[0].transactionId).toBe('tx_102');
      expect(res.body.data.notifications[0].amount).toBe(15000);
      expect(res.body.data.notifications[0].message).toContain('₹15,000');
    });

    it('should enforce idempotency and ignore duplicate events for same transaction', async () => {
      const event = {
        event: 'EXPENSE_CREATED',
        transactionId: 'tx_duplicate_999',
        userId: user1,
        amount: 20000,
        category: 'Travel'
      };

      // Process first time
      await processExpenseEvent(event);
      // Process duplicate delivery (e.g. RabbitMQ retry or network replay)
      await processExpenseEvent(event);

      const count = await Notification.countDocuments({ userId: user1 });
      expect(count).toBe(1);
    });
  });

  describe('Mark Notification as Read & Ownership Isolation', () => {
    let notifId;

    beforeEach(async () => {
      await processExpenseEvent({
        event: 'EXPENSE_CREATED',
        transactionId: 'tx_read_test',
        userId: user1,
        amount: 18000,
        category: 'Jewelry'
      });

      const res = await request(app)
        .get('/notifications')
        .set('x-user-id', user1);
      notifId = res.body.data.notifications[0].id;
    });

    it('should mark notification as read', async () => {
      const res = await request(app)
        .patch(`/notifications/${notifId}/read`)
        .set('x-user-id', user1);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notification.isRead).toBe(true);

      const check = await request(app)
        .get('/notifications')
        .set('x-user-id', user1);
      expect(check.body.data.unreadCount).toBe(0);
    });

    it('should prevent another user from accessing or marking notification as read', async () => {
      const res = await request(app)
        .patch(`/notifications/${notifId}/read`)
        .set('x-user-id', user2);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
