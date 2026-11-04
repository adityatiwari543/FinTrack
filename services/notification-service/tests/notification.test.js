const request = require('supertest');
const app = require('../src/app');
const {
  processExpenseEvent,
  validateExpenseEvent,
  handleMessage,
  scheduleReconnect
} = require('../src/services/eventConsumer');
const Notification = require('../src/models/notification.model');
const config = require('../src/config/env');

describe('Notification Service API & Consumer Tests', () => {
  const internalSecret = 'test_internal_secret_32_characters';
  const user1 = 'user_672b1234567890abcdef1111';
  const user2 = 'user_672b1234567890abcdef2222';

  describe('GET /health', () => {
    it('should return service name and status ok without internal token (public health check)', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('notification-service');
    });
  });

  describe('Internal Gateway Authentication Check', () => {
    it('should reject direct access without x-internal-token with 403', async () => {
      const res = await request(app).get('/notifications');
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN_DIRECT_ACCESS');
    });

    it('should reject direct access with invalid x-internal-token with 403', async () => {
      const res = await request(app)
        .get('/notifications')
        .set('x-internal-token', 'wrong_token');
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_INTERNAL_TOKEN');
    });
  });

  describe('Authentication Check (User Identity)', () => {
    it('should reject request without x-user-id header with 401 when internal token is valid', async () => {
      const res = await request(app)
        .get('/notifications')
        .set('x-internal-token', internalSecret);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Threshold Settings API', () => {
    it('should return default threshold if none configured', async () => {
      const res = await request(app)
        .get('/settings/threshold')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.threshold).toBe(10000);
    });

    it('should successfully update user threshold', async () => {
      const res = await request(app)
        .put('/settings/threshold')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1)
        .send({ threshold: 25000 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.threshold).toBe(25000);

      const check = await request(app)
        .get('/settings/threshold')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1);
      expect(check.body.data.threshold).toBe(25000);
    });

    it('should reject negative threshold value', async () => {
      const res = await request(app)
        .put('/settings/threshold')
        .set('x-internal-token', internalSecret)
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
        .set('x-internal-token', internalSecret)
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
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1);
      notifId = res.body.data.notifications[0].id;
    });

    it('should mark notification as read', async () => {
      const res = await request(app)
        .patch(`/notifications/${notifId}/read`)
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notification.isRead).toBe(true);

      const check = await request(app)
        .get('/notifications')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1);
      expect(check.body.data.unreadCount).toBe(0);
    });

    it('should prevent another user from accessing or marking notification as read', async () => {
      const res = await request(app)
        .patch(`/notifications/${notifId}/read`)
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user2);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('RabbitMQ Reliability, Bounded Retries & Dead-Letter Queue (Unit / Mock Tests)', () => {
    let mockChannel;

    beforeEach(() => {
      mockChannel = {
        ack: jest.fn(),
        nack: jest.fn(),
        sendToQueue: jest.fn()
      };
    });

    function createMockMsg(content, headers = {}) {
      const buffer = typeof content === 'string' ? Buffer.from(content) : Buffer.from(JSON.stringify(content));
      return {
        content: buffer,
        properties: {
          headers: { ...headers }
        }
      };
    }

    it('Scenario 1 & 2: Valid expense event creates a notification and acknowledges message', async () => {
      const msg = createMockMsg({
        transactionId: 'tx_valid_ack_1',
        userId: user1,
        amount: 30000,
        category: 'Travel'
      });

      await handleMessage(mockChannel, msg);

      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
      expect(mockChannel.sendToQueue).not.toHaveBeenCalled();

      const notif = await Notification.findOne({ transactionId: 'tx_valid_ack_1' });
      expect(notif).toBeDefined();
      expect(notif.amount).toBe(30000);
      expect(notif.userId).toBe(user1);
    });

    it('Scenario 3: Duplicate event is acknowledged without creating another notification (Idempotency)', async () => {
      const msg = createMockMsg({
        transactionId: 'tx_duplicate_ack_1',
        userId: user1,
        amount: 25000,
        category: 'Shopping'
      });

      // First delivery
      await handleMessage(mockChannel, msg);
      expect(mockChannel.ack).toHaveBeenCalledTimes(1);

      // Re-delivery (e.g. RabbitMQ redelivery or retry replay)
      await handleMessage(mockChannel, msg);
      expect(mockChannel.ack).toHaveBeenCalledTimes(2);

      const count = await Notification.countDocuments({ transactionId: 'tx_duplicate_ack_1' });
      expect(count).toBe(1);
    });

    it('Scenario 4: Malformed JSON is routed directly to DLQ without retry and acknowledged', async () => {
      const badMsg = {
        content: Buffer.from('{ malformed_json: not_closed, broken:'),
        properties: { headers: {} }
      };

      await handleMessage(mockChannel, badMsg);

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        config.dlqName,
        badMsg.content,
        expect.objectContaining({
          persistent: true,
          headers: expect.objectContaining({
            'x-rejection-reason': 'MALFORMED_JSON'
          })
        })
      );
      expect(mockChannel.ack).toHaveBeenCalledWith(badMsg);
    });

    it('Scenario 5: Invalid event structure is routed to DLQ as a permanent failure without retry', async () => {
      // Missing userId and negative amount
      const invalidMsg = createMockMsg({
        transactionId: 'tx_bad_schema',
        amount: -5000
      });

      await handleMessage(mockChannel, invalidMsg);

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        config.dlqName,
        invalidMsg.content,
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-rejection-reason': 'INVALID_EVENT_SCHEMA'
          })
        })
      );
      expect(mockChannel.ack).toHaveBeenCalledWith(invalidMsg);
    });

    it('Scenario 6 & 7: Temporary MongoDB failure routes to Retry Queue and increments x-retry-count', async () => {
      // Simulate temporary MongoDB failure
      jest.spyOn(Notification, 'create').mockRejectedValueOnce(new Error('MongoNetworkTimeoutException: connection closed'));

      const initialMsg = createMockMsg({
        transactionId: 'tx_temp_fail_1',
        userId: user1,
        amount: 20000,
        category: 'Groceries'
      }, { 'x-retry-count': 0 });

      await handleMessage(mockChannel, initialMsg);

      // Routed to retry queue with delay, original acknowledged
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        config.retryQueueName,
        initialMsg.content,
        expect.objectContaining({
          persistent: true,
          headers: expect.objectContaining({
            'x-retry-count': 1,
            'x-last-error': 'MongoNetworkTimeoutException: connection closed'
          })
        })
      );
      expect(mockChannel.ack).toHaveBeenCalledWith(initialMsg);
    });

    it('Scenario 8: Message reaching retry limit is routed to DLQ with MAX_RETRIES_EXCEEDED and acknowledged', async () => {
      jest.spyOn(Notification, 'create').mockRejectedValueOnce(new Error('Persistent Database Outage'));

      const exhaustedMsg = createMockMsg({
        transactionId: 'tx_exhausted_1',
        userId: user1,
        amount: 22000,
        category: 'Electronics'
      }, { 'x-retry-count': config.maxRetries }); // Already at maxRetries (3)

      await handleMessage(mockChannel, exhaustedMsg);

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        config.dlqName,
        exhaustedMsg.content,
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-retry-count': config.maxRetries,
            'x-rejection-reason': 'MAX_RETRIES_EXCEEDED',
            'x-last-error': 'Persistent Database Outage'
          })
        })
      );
      expect(mockChannel.ack).toHaveBeenCalledWith(exhaustedMsg);
    });

    it('Scenario 9: Successful retry delivery eventually creates the notification', async () => {
      // Message coming back from retry queue (attempt 2)
      const retriedMsg = createMockMsg({
        transactionId: 'tx_retry_success_1',
        userId: user1,
        amount: 18000,
        category: 'Furniture'
      }, { 'x-retry-count': 2 });

      await handleMessage(mockChannel, retriedMsg);

      expect(mockChannel.ack).toHaveBeenCalledWith(retriedMsg);
      expect(mockChannel.sendToQueue).not.toHaveBeenCalled();

      const notif = await Notification.findOne({ transactionId: 'tx_retry_success_1' });
      expect(notif).toBeDefined();
      expect(notif.amount).toBe(18000);
    });

    it('Scenario 10: Reconnection logic is safely callable and test environment skips live reconnect', () => {
      expect(() => scheduleReconnect()).not.toThrow();
    });

    it('Scenario 12: Existing threshold comparison remains intact (expense below threshold produces no alert)', async () => {
      const belowThresholdMsg = createMockMsg({
        transactionId: 'tx_below_threshold_1',
        userId: user1,
        amount: 200, // Below default 10,000 threshold
        category: 'Coffee'
      });

      await handleMessage(mockChannel, belowThresholdMsg);

      expect(mockChannel.ack).toHaveBeenCalledWith(belowThresholdMsg);
      expect(mockChannel.sendToQueue).not.toHaveBeenCalled();

      const notif = await Notification.findOne({ transactionId: 'tx_below_threshold_1' });
      expect(notif).toBeNull();
    });
  });
});
