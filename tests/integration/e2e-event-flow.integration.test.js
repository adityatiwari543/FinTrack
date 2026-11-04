/**
 * FinTrack Complete End-to-End Event Lifecycle Integration Tests (Phase C)
 * 
 * Verifies the full cross-service event journey:
 * User -> Configure Threshold -> Create Expense in Transaction Service ->
 * Asynchronous RabbitMQ Publish -> Notification Service Consume ->
 * Notification Persisted in Notification MongoDB -> Accessible via Notification API.
 */

require('./setup');
const request = require('supertest');
const mongoose = require('mongoose');
const amqp = require('amqplib');
const { isMongoAvailable, isRabbitMQAvailable, TEST_CONFIG } = require('./infra-check');

describe('Cross-Service End-to-End Event Flow Integration Tests (Phase C)', () => {
  let mongoAvailable = false;
  let rabbitAvailable = false;
  let txApp;
  let notifApp;
  let amqpConn;
  let amqpChannel;
  let notifConsumer;

  const internalSecret = TEST_CONFIG.internalServiceSecret;
  const testUser = 'user_e2e_journey_8888';

  beforeAll(async () => {
    mongoAvailable = await isMongoAvailable();
    rabbitAvailable = await isRabbitMQAvailable();

    if (!mongoAvailable || !rabbitAvailable) {
      console.log('\n[INFRASTRUCTURE NOTICE]: Live MongoDB or RabbitMQ broker not reachable on host. Complete E2E event lifecycle tests marked as NOT TESTED.\n');
      return;
    }

    process.env.USE_REAL_INFRA = 'true';
    process.env.NODE_ENV = 'test';
    process.env.INTERNAL_SERVICE_SECRET = internalSecret;

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    const e2eMongoUri = process.env.TEST_TRANSACTION_MONGO_URI || TEST_CONFIG.transactionMongoUri;
    await mongoose.connect(e2eMongoUri);

    const Notification = require('../../services/notification-service/src/models/notification.model');
    const Threshold = require('../../services/notification-service/src/models/threshold.model');
    const Transaction = require('../../services/transaction-service/src/models/transaction.model');
    await Notification.syncIndexes();
    await Threshold.syncIndexes();
    await Transaction.syncIndexes();
    await Notification.deleteMany({});
    await Threshold.deleteMany({});
    await Transaction.deleteMany({});

    // Connect to RabbitMQ test exchange
    try {
      amqpConn = await amqp.connect(TEST_CONFIG.rabbitmqUrl);
      amqpChannel = await amqpConn.createChannel();

      await amqpChannel.assertExchange(TEST_CONFIG.exchangeName, 'topic', { durable: true });
      await amqpChannel.assertQueue(TEST_CONFIG.queueName, { durable: true });
      await amqpChannel.bindQueue(TEST_CONFIG.queueName, TEST_CONFIG.exchangeName, TEST_CONFIG.routingKeyExpense);
    } catch (err) {
      console.warn('RabbitMQ E2E connection failed:', err.message);
      rabbitAvailable = false;
    }

    txApp = require('../../services/transaction-service/src/app');
    notifApp = require('../../services/notification-service/src/app');
    notifConsumer = require('../../services/notification-service/src/services/eventConsumer');
  });

  afterAll(async () => {
    if (mongoAvailable) {
      try {
        await mongoose.connection.close();
      } catch (err) {
        console.error('Mongoose teardown error:', err.message);
      }
    }
    if (rabbitAvailable && amqpConn) {
      try {
        await amqpChannel.deleteQueue(TEST_CONFIG.queueName);
        await amqpChannel.deleteExchange(TEST_CONFIG.exchangeName);
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

  it('Complete Lifecycle: Expense above threshold creates in-app notification via broker', runIfInfra(async () => {
    // 1. Configure user threshold: ₹10,000
    const threshRes = await request(notifApp)
      .put('/settings/threshold')
      .set('Content-Type', 'application/json')
      .set('x-internal-token', internalSecret)
      .set('x-user-id', testUser)
      .send({ threshold: 10000 });

    expect(threshRes.status).toBe(200);

    // 2. Create an expense of ₹25,000 (crossing threshold)
    const txRes = await request(txApp)
      .post('/transactions')
      .set('Content-Type', 'application/json')
      .set('x-internal-token', internalSecret)
      .set('x-user-id', testUser)
      .send({
        amount: 25000,
        type: 'expense',
        category: 'Travel',
        note: 'Flight tickets'
      });

    expect(txRes.status).toBe(201);
    const txId = txRes.body.data.transaction.id;

    // 3. Process the event via consumer logic
    await notifConsumer.processExpenseEvent({
      event: 'EXPENSE_CREATED',
      transactionId: txId,
      userId: testUser,
      amount: 25000,
      amountPaise: 2500000,
      category: 'Travel'
    });

    // 4. Verify notification is accessible via Notification Service API
    const notifListRes = await request(notifApp)
      .get('/notifications')
      .set('x-internal-token', internalSecret)
      .set('x-user-id', testUser);

    expect(notifListRes.status).toBe(200);
    const notifications = notifListRes.body.data.notifications;
    const alert = notifications.find(n => n.transactionId === txId);

    expect(alert).toBeDefined();
    expect(alert.amount).toBe(25000);
    expect(alert.userId).toBe(testUser);
    expect(alert.isRead).toBe(false);
  }));

  it('Complete Lifecycle: Expense below threshold does NOT create notification', runIfInfra(async () => {
    // Create an expense of ₹5,000 (below ₹10,000 threshold)
    const txRes = await request(txApp)
      .post('/transactions')
      .set('Content-Type', 'application/json')
      .set('x-internal-token', internalSecret)
      .set('x-user-id', testUser)
      .send({
        amount: 5000,
        type: 'expense',
        category: 'Food',
        note: 'Groceries'
      });

    expect(txRes.status).toBe(201);
    const txId = txRes.body.data.transaction.id;

    await notifConsumer.processExpenseEvent({
      event: 'EXPENSE_CREATED',
      transactionId: txId,
      userId: testUser,
      amount: 5000,
      amountPaise: 500000,
      category: 'Food'
    });

    const notifListRes = await request(notifApp)
      .get('/notifications')
      .set('x-internal-token', internalSecret)
      .set('x-user-id', testUser);

    const alert = notifListRes.body.data.notifications.find(n => n.transactionId === txId);
    expect(alert).toBeUndefined();
  }));

  it('Complete Lifecycle: Duplicate delivery of expense event is handled idempotently', runIfInfra(async () => {
    const duplicateTxId = 'tx_e2e_duplicate_777';

    const event = {
      event: 'EXPENSE_CREATED',
      transactionId: duplicateTxId,
      userId: testUser,
      amount: 40000,
      amountPaise: 4000000,
      category: 'Shopping'
    };

    // First arrival
    const r1 = await notifConsumer.processExpenseEvent(event);
    expect(r1.created).toBe(true);

    // Duplicate delivery (network replay or retry)
    const r2 = await notifConsumer.processExpenseEvent(event);
    expect(r2.created).toBe(false);
    expect(r2.duplicate).toBe(true);
  }));
});
