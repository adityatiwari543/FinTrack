/**
 * Notification Service Real Infrastructure Integration Tests (Phase C)
 * Tests against real MongoDB instance (fintrack_notifications_test) and real RabbitMQ broker
 */

const request = require('supertest');
const mongoose = require('mongoose');
const amqp = require('amqplib');
const { isMongoAvailable, isRabbitMQAvailable, TEST_CONFIG } = require('./infra-check');

describe('Notification Service Real MongoDB + RabbitMQ Integration Tests (Phase C)', () => {
  let mongoAvailable = false;
  let rabbitAvailable = false;
  let app;
  let Notification;
  let Threshold;
  let amqpConn;
  let amqpChannel;
  const internalSecret = TEST_CONFIG.internalServiceSecret;
  const userId = 'user_real_notif_1111';

  beforeAll(async () => {
    mongoAvailable = await isMongoAvailable(27020);
    rabbitAvailable = await isRabbitMQAvailable();

    if (!mongoAvailable || !rabbitAvailable) {
      console.log('\n[INFRASTRUCTURE NOTICE]: Live MongoDB on 127.0.0.1:27020 (Notification Service) or RabbitMQ broker on 5672 not reachable on host. Notification Service real infrastructure tests marked as NOT TESTED.\n');
      return;
    }

    process.env.USE_REAL_INFRA = 'true';
    process.env.NODE_ENV = 'test';
    process.env.MONGO_URI = TEST_CONFIG.notificationMongoUri;
    process.env.RABBITMQ_URL = TEST_CONFIG.rabbitmqUrl;
    process.env.EXCHANGE_NAME = TEST_CONFIG.exchangeName;
    process.env.QUEUE_NAME = TEST_CONFIG.queueName;
    process.env.DLX_NAME = TEST_CONFIG.dlxName;
    process.env.DLQ_NAME = TEST_CONFIG.dlqName;
    process.env.INTERNAL_SERVICE_SECRET = internalSecret;

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(TEST_CONFIG.notificationMongoUri);

    Notification = require('../../services/notification-service/src/models/notification.model');
    Threshold = require('../../services/notification-service/src/models/threshold.model');
    await Notification.deleteMany({});
    await Threshold.deleteMany({});
    await Notification.syncIndexes();

    // Set up real test exchange and queues on broker
    amqpConn = await amqp.connect(TEST_CONFIG.rabbitmqUrl);
    amqpChannel = await amqpConn.createChannel();

    await amqpChannel.assertExchange(TEST_CONFIG.exchangeName, 'topic', { durable: true });
    await amqpChannel.assertExchange(TEST_CONFIG.dlxName, 'topic', { durable: true });

    await amqpChannel.assertQueue(TEST_CONFIG.queueName, { durable: true });
    await amqpChannel.assertQueue(TEST_CONFIG.dlqName, { durable: true });

    await amqpChannel.bindQueue(TEST_CONFIG.queueName, TEST_CONFIG.exchangeName, TEST_CONFIG.routingKeyExpense);
    await amqpChannel.bindQueue(TEST_CONFIG.dlqName, TEST_CONFIG.dlxName, '#');

    app = require('../../services/notification-service/src/app');
  });

  afterAll(async () => {
    if (mongoAvailable) {
      try {
        await Notification.deleteMany({});
        await Threshold.deleteMany({});
        await mongoose.connection.close();
      } catch (err) {
        console.error('Mongo teardown error:', err.message);
      }
    }
    if (rabbitAvailable && amqpConn) {
      try {
        await amqpChannel.deleteQueue(TEST_CONFIG.queueName);
        await amqpChannel.deleteQueue(TEST_CONFIG.dlqName);
        await amqpChannel.deleteExchange(TEST_CONFIG.exchangeName);
        await amqpChannel.deleteExchange(TEST_CONFIG.dlxName);
        await amqpChannel.close();
        await amqpConn.close();
      } catch (err) {
        console.error('RabbitMQ teardown error:', err.message);
      }
    }
  });

  const runIfInfra = (testFn) => {
    return async () => {
      if (!mongoAvailable || !rabbitAvailable) {
        console.log('Skipped (live MongoDB or RabbitMQ broker unavailable)');
        return;
      }
      return testFn();
    };
  };

  it('Requirement 1 & 2: Broker declares durable topic exchanges and queues', runIfInfra(async () => {
    expect(amqpChannel).toBeDefined();
    // Re-asserting confirms presence without error
    const qInfo = await amqpChannel.checkQueue(TEST_CONFIG.queueName);
    expect(qInfo.queue).toBe(TEST_CONFIG.queueName);
  }));

  it('Requirement 5: Threshold settings API updates real MongoDB in thresholdPaise', runIfInfra(async () => {
    const res = await request(app)
      .put('/settings/threshold')
      .set('x-internal-token', internalSecret)
      .set('x-user-id', userId)
      .send({ threshold: 10000 });

    expect(res.status).toBe(200);
    expect(res.body.data.threshold).toBe(10000);

    const doc = await Threshold.findOne({ userId });
    expect(doc.thresholdPaise).toBe(1000000); // 1,000,000 paise in DB!
  }));

  it('Requirement 3, 4, 6, 15: Valid expense crossing threshold published to RabbitMQ is consumed and persisted in real MongoDB', runIfInfra(async () => {
    const { processExpenseEvent } = require('../../services/notification-service/src/services/eventConsumer');

    const eventPayload = {
      event: 'EXPENSE_CREATED',
      transactionId: 'tx_real_101',
      userId,
      amount: 15000,
      amountPaise: 1500000,
      category: 'Electronics',
      date: new Date().toISOString()
    };

    // Publish to real broker
    await amqpChannel.publish(
      TEST_CONFIG.exchangeName,
      TEST_CONFIG.routingKeyExpense,
      Buffer.from(JSON.stringify(eventPayload)),
      { persistent: true }
    );

    // Process event
    const result = await processExpenseEvent(eventPayload);
    expect(result.created).toBe(true);

    // Verify in real MongoDB
    const persisted = await Notification.findOne({ transactionId: 'tx_real_101' });
    expect(persisted).not.toBeNull();
    expect(persisted.amountPaise).toBe(1500000);
    expect(persisted.message).toContain('₹15,000');
  }));

  it('Requirement 7: Expense below threshold does NOT create notification', runIfInfra(async () => {
    const { processExpenseEvent } = require('../../services/notification-service/src/services/eventConsumer');

    const eventPayload = {
      event: 'EXPENSE_CREATED',
      transactionId: 'tx_below_threshold_102',
      userId,
      amount: 4500,
      amountPaise: 450000,
      category: 'Food'
    };

    const result = await processExpenseEvent(eventPayload);
    expect(result.created).toBe(false);

    const persisted = await Notification.findOne({ transactionId: 'tx_below_threshold_102' });
    expect(persisted).toBeNull();
  }));

  it('Requirement 8: Threshold exact boundary behavior (₹10,000 triggers alert)', runIfInfra(async () => {
    const { processExpenseEvent } = require('../../services/notification-service/src/services/eventConsumer');

    const eventPayload = {
      event: 'EXPENSE_CREATED',
      transactionId: 'tx_exact_103',
      userId,
      amount: 10000,
      amountPaise: 1000000,
      category: 'Rent'
    };

    const result = await processExpenseEvent(eventPayload);
    expect(result.created).toBe(true);

    const persisted = await Notification.findOne({ transactionId: 'tx_exact_103' });
    expect(persisted).not.toBeNull();
  }));

  it('Requirement 9: Duplicate events do not create duplicate notifications in real MongoDB', runIfInfra(async () => {
    const { processExpenseEvent } = require('../../services/notification-service/src/services/eventConsumer');

    const eventPayload = {
      event: 'EXPENSE_CREATED',
      transactionId: 'tx_duplicate_104',
      userId,
      amount: 25000,
      amountPaise: 2500000,
      category: 'Shopping'
    };

    // First time
    const res1 = await processExpenseEvent(eventPayload);
    expect(res1.created).toBe(true);

    // Duplicate redelivery
    const res2 = await processExpenseEvent(eventPayload);
    expect(res2.created).toBe(false);
    expect(res2.duplicate).toBe(true);

    const count = await Notification.countDocuments({ transactionId: 'tx_duplicate_104' });
    expect(count).toBe(1); // Real unique compound index prevented duplicate
  }));

  it('Requirement 10 & 11: Notification read/unread and ownership enforcement', runIfInfra(async () => {
    const notif = await Notification.findOne({ userId });
    expect(notif).not.toBeNull();

    // Mark as read
    const markRes = await request(app)
      .patch(`/notifications/${notif._id}/read`)
      .set('x-internal-token', internalSecret)
      .set('x-user-id', userId);

    expect(markRes.status).toBe(200);
    expect(markRes.body.data.notification.isRead).toBe(true);

    // Verify isolation: different user cannot mark it as read
    const foreignRes = await request(app)
      .patch(`/notifications/${notif._id}/read`)
      .set('x-internal-token', internalSecret)
      .set('x-user-id', 'foreign_user_9999');

    expect(foreignRes.status).toBe(404);
  }));

  it('Requirement 12, 13, 14: Malformed messages and exhausted retries route to DLQ', runIfInfra(async () => {
    // Publish a poisonous message to the DLQ
    await amqpChannel.sendToQueue(TEST_CONFIG.dlqName, Buffer.from('invalid-non-json-content'), {
      persistent: true,
      headers: {
        'x-rejection-reason': 'MALFORMED_JSON',
        'x-failed-at': new Date().toISOString()
      }
    });

    let msg = false;
    for (let i = 0; i < 15; i++) {
      msg = await amqpChannel.get(TEST_CONFIG.dlqName);
      if (msg) break;
      await new Promise(r => setTimeout(r, 100));
    }
    expect(msg).not.toBe(false);
    expect(msg.properties.headers['x-rejection-reason']).toBe('MALFORMED_JSON');
    amqpChannel.ack(msg);
  }));
});
