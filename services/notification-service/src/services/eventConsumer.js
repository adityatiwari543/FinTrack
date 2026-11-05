const amqp = require('amqplib');
const config = require('../config/env');
const logger = require('../utils/logger');
const Notification = require('../models/notification.model');
const Threshold = require('../models/threshold.model');
const { toPaise, toRupees, formatINR } = require('../utils/currency');

let connection = null;
let channel = null;
let consumerTag = null;
let isConnecting = false;
let reconnectTimer = null;
let reconnectAttempts = 0;
let activeProcessingCount = 0;

/**
 * Validate incoming event payload schema
 */
function validateExpenseEvent(eventData) {
  if (!eventData || typeof eventData !== 'object') {
    return { isValid: false, error: 'Payload must be a non-null object' };
  }

  const { transactionId, userId, amount, amountPaise } = eventData;

  if (!transactionId || typeof transactionId !== 'string' || !transactionId.trim()) {
    return { isValid: false, error: 'Missing or invalid transactionId' };
  }

  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return { isValid: false, error: 'Missing or invalid userId' };
  }

  if (amountPaise !== undefined) {
    if (typeof amountPaise !== 'number' || !Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      return { isValid: false, error: 'amountPaise must be a positive safe integer' };
    }
  } else if (typeof amount !== 'number' || Number.isNaN(amount) || !Number.isFinite(amount) || amount <= 0) {
    return { isValid: false, error: 'Amount must be a positive finite number' };
  }

  return { isValid: true };
}

/**
 * Core business logic: Evaluate threshold and create notification idempotently
 * All comparisons are performed in canonical integer paise.
 */
async function processExpenseEvent(eventData) {
  const { transactionId, userId, amount, amountPaise, category } = eventData;

  // Determine expense in canonical integer paise
  let expensePaise;
  if (typeof amountPaise === 'number' && Number.isSafeInteger(amountPaise)) {
    expensePaise = amountPaise;
  } else {
    expensePaise = toPaise(amount);
  }

  // 1. Fetch user custom threshold or fall back to system default (in paise)
  const userThresholdRecord = await Threshold.findOne({ userId });
  let thresholdPaise;
  if (userThresholdRecord) {
    if (typeof userThresholdRecord.thresholdPaise === 'number') {
      thresholdPaise = userThresholdRecord.thresholdPaise;
    } else {
      thresholdPaise = toPaise(userThresholdRecord.threshold, true);
    }
  } else {
    thresholdPaise = toPaise(config.defaultAlertThreshold, true);
  }

  // 2. Evaluate if single expense meets or exceeds threshold
  if (expensePaise >= thresholdPaise) {
    const expenseRupees = toRupees(expensePaise);
    const thresholdRupees = toRupees(thresholdPaise);
    const formattedAmount = formatINR(expenseRupees);
    const formattedThreshold = formatINR(thresholdRupees);
    const message = `Expense alert: ${formattedAmount} spent on ${category || 'Expense'} exceeds your threshold of ${formattedThreshold}`;

    try {
      // Idempotent insertion: compound index on (userId, transactionId) prevents duplicates
      const notification = await Notification.create({
        userId,
        transactionId,
        amountPaise: expensePaise,
        amount: expenseRupees,
        category: category || 'Expense',
        message
      });

      logger.info({ userId, transactionId, expensePaise, thresholdPaise }, 'Expense alert notification created');
      return { processed: true, created: true, notification };
    } catch (err) {
      if (err.code === 11000) {
        // Idempotency: duplicate delivery detected, safely acknowledge
        logger.info({ userId, transactionId }, 'Duplicate expense event ignored (idempotent)');
        return { processed: true, created: false, duplicate: true };
      }
      // Re-throw transient database/network errors to trigger retry pipeline
      throw err;
    }
  } else {
    logger.debug({ userId, expensePaise, thresholdPaise }, 'Expense below threshold, no notification required');
    return { processed: true, created: false, thresholdExceeded: false };
  }
}

/**
 * Handle a message received from RabbitMQ
 * Implements bounded retries via retry queue and dead-letter queue for poison pills
 */
async function handleMessage(ch, msg) {
  if (!msg) return;
  activeProcessingCount++;
  try {
    const rawContent = msg.content ? msg.content.toString() : '';
  let eventData = null;

  // 1. Check for malformed JSON (permanent failure -> DLQ immediately)
  try {
    eventData = JSON.parse(rawContent);
  } catch (parseErr) {
    logger.error({ err: parseErr.message }, 'Permanent failure: malformed JSON received; routing to DLQ');
    try {
      ch.sendToQueue(config.dlqName, msg.content, {
        persistent: true,
        headers: {
          ...(msg.properties && msg.properties.headers),
          'x-rejection-reason': 'MALFORMED_JSON',
          'x-parse-error': parseErr.message,
          'x-failed-at': new Date().toISOString()
        }
      });
      ch.ack(msg);
    } catch (dlqErr) {
      logger.error({ err: dlqErr.message }, 'Failed to route malformed message to DLQ');
    }
    return;
  }

  // 2. Validate schema requirements (permanent failure -> DLQ immediately)
  const validation = validateExpenseEvent(eventData);
  if (!validation.isValid) {
    logger.warn({ error: validation.error, eventData }, 'Permanent failure: invalid event schema; routing to DLQ');
    try {
      ch.sendToQueue(config.dlqName, msg.content, {
        persistent: true,
        contentType: 'application/json',
        headers: {
          ...(msg.properties && msg.properties.headers),
          'x-rejection-reason': 'INVALID_EVENT_SCHEMA',
          'x-validation-error': validation.error,
          'x-failed-at': new Date().toISOString()
        }
      });
      ch.ack(msg);
    } catch (dlqErr) {
      logger.error({ err: dlqErr.message }, 'Failed to route invalid schema message to DLQ');
    }
    return;
  }

  // 3. Process business logic (transient failures retried via retry queue)
  try {
    await processExpenseEvent(eventData);
    // Acknowledge upon successful processing or verified duplicate
    ch.ack(msg);
  } catch (err) {
    logger.error({
      err: err.message,
      transactionId: eventData.transactionId,
      userId: eventData.userId
    }, 'Transient failure while processing expense message');

    const headers = (msg.properties && msg.properties.headers) || {};
    const currentRetries = Number(headers['x-retry-count'] || 0);

    if (currentRetries < config.maxRetries) {
      const nextAttempt = currentRetries + 1;
      logger.warn({
        transactionId: eventData.transactionId,
        attempt: nextAttempt,
        maxRetries: config.maxRetries,
        delayMs: config.retryDelayMs
      }, `Routing message to retry queue (attempt ${nextAttempt} of ${config.maxRetries})`);

      try {
        ch.sendToQueue(config.retryQueueName, msg.content, {
          persistent: true,
          contentType: 'application/json',
          headers: {
            ...headers,
            'x-retry-count': nextAttempt,
            'x-last-error': err.message,
            'x-last-failed-at': new Date().toISOString()
          }
        });
        // Safely acknowledge from main queue since message is now buffered in retry queue
        ch.ack(msg);
      } catch (retryRouteErr) {
        logger.error({ err: retryRouteErr.message }, 'Failed to route message to retry queue; message will remain unacked');
      }
    } else {
      // Exceeded max retry attempts -> Dead-letter queue
      logger.error({
        transactionId: eventData.transactionId,
        exhaustedRetries: currentRetries,
        maxRetries: config.maxRetries
      }, 'Message exceeded maximum retries; routing to DLQ');

      try {
        ch.sendToQueue(config.dlqName, msg.content, {
          persistent: true,
          contentType: 'application/json',
          headers: {
            ...headers,
            'x-retry-count': currentRetries,
            'x-rejection-reason': 'MAX_RETRIES_EXCEEDED',
            'x-last-error': err.message,
            'x-failed-at': new Date().toISOString()
          }
        });
        // Safely acknowledge original message once preserved in DLQ
        ch.ack(msg);
      } catch (dlqErr) {
        logger.error({ err: dlqErr.message }, 'Failed to route exhausted message to DLQ; message remains unacked');
      }
    }
  }
  } finally {
    activeProcessingCount--;
  }
}

/**
 * Initialize RabbitMQ topology and message consumer
 */
async function initRabbitMQConsumer() {
  if (config.nodeEnv === 'test') {
    logger.info('Test environment: RabbitMQ consumer skipped');
    return;
  }

  if (channel || isConnecting) return;

  isConnecting = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    connection = await amqp.connect(config.rabbitmqUrl);

    connection.on('error', (err) => {
      logger.error({ err: err.message }, 'RabbitMQ connection error');
    });

    connection.on('close', () => {
      logger.warn('RabbitMQ connection closed. Scheduling reconnection with backoff...');
      cleanupConnection();
      scheduleReconnect();
    });

    channel = await connection.createChannel();

    channel.on('error', (err) => {
      logger.error({ err: err.message }, 'RabbitMQ channel error');
    });

    channel.on('close', () => {
      logger.warn('RabbitMQ channel closed.');
      channel = null;
    });

    // 1. Declare Main Topic Exchange (durable)
    await channel.assertExchange(config.exchangeName, 'topic', { durable: true });

    // 2. Declare Dead-Letter Exchange (DLX, durable)
    await channel.assertExchange(config.dlxName, 'topic', { durable: true });

    // 3. Declare Dead-Letter Queue (DLQ, durable)
    await channel.assertQueue(config.dlqName, { durable: true });
    await channel.bindQueue(config.dlqName, config.dlxName, '#');

    // 4. Declare Retry Queue with message TTL pointing back to Main Exchange
    await channel.assertQueue(config.retryQueueName, {
      durable: true,
      arguments: {
        'x-message-ttl': config.retryDelayMs,
        'x-dead-letter-exchange': config.exchangeName,
        'x-dead-letter-routing-key': config.routingKeyExpense
      }
    });

    // 5. Declare Main Consumer Queue (durable)
    const q = await channel.assertQueue(config.queueName, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': config.dlxName,
        'x-dead-letter-routing-key': 'expense.deadletter'
      }
    });

    // Bind main queue to main exchange
    await channel.bindQueue(q.queue, config.exchangeName, config.routingKeyExpense);

    // Limit unacknowledged messages to 10
    await channel.prefetch(10);

    // 6. Start consuming
    const consumeResult = await channel.consume(
      q.queue,
      (msg) => handleMessage(channel, msg),
      { noAck: false }
    );
    consumerTag = consumeResult.consumerTag;

    reconnectAttempts = 0; // Reset backoff on successful initialization
    logger.info({
      queue: q.queue,
      retryQueue: config.retryQueueName,
      dlq: config.dlqName,
      exchange: config.exchangeName
    }, 'RabbitMQ Consumer connected with bounded retry and DLQ');
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to connect RabbitMQ consumer. Scheduling reconnection...');
    cleanupConnection();
    scheduleReconnect();
  } finally {
    isConnecting = false;
  }
}

function cleanupConnection() {
  channel = null;
  connection = null;
  consumerTag = null;
}

function scheduleReconnect() {
  if (reconnectTimer || config.nodeEnv === 'test') return;
  reconnectAttempts++;
  // Exponential backoff capped at 30 seconds
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
  logger.info({ attempt: reconnectAttempts, delayMs: delay }, 'Scheduling RabbitMQ reconnection attempt');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    initRabbitMQConsumer();
  }, delay);
}

/**
 * Cleanly close consumer, channel and connection on process shutdown
 * Drains active in-flight processing up to maxWaitMs before severing connections.
 */
async function closeRabbitMQConsumer(maxWaitMs = 5000) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    // 1. Cancel consumer so RabbitMQ broker halts new deliveries
    if (channel && consumerTag) {
      await channel.cancel(consumerTag).catch(() => {});
      consumerTag = null;
    }

    // 2. Await in-flight message processing to finish draining
    const start = Date.now();
    while (activeProcessingCount > 0 && (Date.now() - start) < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (activeProcessingCount > 0) {
      logger.warn({ inFlightRemaining: activeProcessingCount }, 'Shutdown timeout reached with messages still in-flight');
    }

    // 3. Close channel and connection
    if (channel) {
      await channel.close().catch(() => {});
    }
    if (connection) {
      await connection.close().catch(() => {});
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Error closing RabbitMQ consumer');
  } finally {
    cleanupConnection();
  }
}

module.exports = {
  validateExpenseEvent,
  processExpenseEvent,
  handleMessage,
  initRabbitMQConsumer,
  closeRabbitMQConsumer,
  scheduleReconnect,
  getActiveProcessingCount: () => activeProcessingCount
};
