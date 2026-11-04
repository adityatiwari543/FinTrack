const amqp = require('amqplib');
const config = require('../config/env');
const logger = require('../utils/logger');
const Notification = require('../models/notification.model');
const Threshold = require('../models/threshold.model');

let connection = null;
let channel = null;
let isConnecting = false;

async function processExpenseEvent(eventData) {
  const { transactionId, userId, amount, category } = eventData;

  if (!transactionId || !userId || typeof amount !== 'number') {
    logger.warn({ eventData }, 'Received invalid expense event format. Skipping.');
    return;
  }

  // Fetch user's threshold or use default
  const userThresholdRecord = await Threshold.findOne({ userId });
  const threshold = userThresholdRecord ? userThresholdRecord.threshold : config.defaultAlertThreshold;

  if (amount >= threshold) {
    const formattedAmount = Number(amount).toLocaleString('en-IN');
    const formattedThreshold = Number(threshold).toLocaleString('en-IN');
    const message = `Expense alert: ₹${formattedAmount} spent on ${category} exceeds your threshold of ₹${formattedThreshold}`;

    try {
      // Idempotent insertion: will fail gracefully if (userId, transactionId) already exists
      await Notification.create({
        userId,
        transactionId,
        amount,
        category: category || 'Expense',
        message
      });

      logger.info({ userId, transactionId, amount, threshold }, 'Expense alert notification created');
    } catch (err) {
      if (err.code === 11000) {
        // Idempotency: duplicate event received and safely ignored
        logger.info({ userId, transactionId }, 'Duplicate expense event ignored (idempotent)');
      } else {
        throw err;
      }
    }
  } else {
    logger.debug({ userId, amount, threshold }, 'Expense below threshold, no notification required');
  }
}

async function initRabbitMQConsumer() {
  if (config.nodeEnv === 'test') {
    logger.info('Test environment: RabbitMQ consumer skipped');
    return;
  }

  if (channel || isConnecting) return;

  isConnecting = true;
  try {
    connection = await amqp.connect(config.rabbitmqUrl);

    connection.on('error', (err) => {
      logger.error({ err }, 'RabbitMQ connection error');
      channel = null;
      connection = null;
    });

    connection.on('close', () => {
      logger.warn('RabbitMQ connection closed. Attempting reconnect in 5s...');
      channel = null;
      connection = null;
      setTimeout(initRabbitMQConsumer, 5000);
    });

    channel = await connection.createChannel();
    await channel.assertExchange(config.exchangeName, 'topic', { durable: true });

    const q = await channel.assertQueue(config.queueName, { durable: true });
    await channel.bindQueue(q.queue, config.exchangeName, config.routingKeyExpense);

    // Limit unacknowledged messages to 10
    await channel.prefetch(10);

    logger.info({ queue: q.queue, exchange: config.exchangeName }, 'RabbitMQ Consumer connected and listening for expense events');

    channel.consume(q.queue, async (msg) => {
      if (!msg) return;

      try {
        const content = msg.content.toString();
        const eventData = JSON.parse(content);

        await processExpenseEvent(eventData);

        // Acknowledge only after successful processing
        channel.ack(msg);
      } catch (err) {
        logger.error({ err: err.message }, 'Failed to process expense event message');
        // Acknowledge to prevent infinite poison pill loop if payload is malformed
        channel.ack(msg);
      }
    }, { noAck: false });
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to connect RabbitMQ consumer (will retry in 5s)');
    channel = null;
    connection = null;
    setTimeout(initRabbitMQConsumer, 5000);
  } finally {
    isConnecting = false;
  }
}

async function closeRabbitMQConsumer() {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
  } catch (err) {
    logger.error({ err }, 'Error closing RabbitMQ consumer');
  }
}

module.exports = {
  processExpenseEvent,
  initRabbitMQConsumer,
  closeRabbitMQConsumer
};
