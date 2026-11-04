const amqp = require('amqplib');
const config = require('../config/env');
const logger = require('../utils/logger');

let connection = null;
let channel = null;
let isConnecting = false;
let reconnectTimer = null;
let reconnectAttempts = 0;

/**
 * Initialize RabbitMQ publisher with confirm channel & durable exchange
 */
async function initRabbitMQ() {
  if (config.nodeEnv === 'test') {
    logger.info('Test environment: RabbitMQ connection skipped');
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
      logger.error({ err: err.message }, 'RabbitMQ publisher connection error');
    });

    connection.on('close', () => {
      logger.warn('RabbitMQ publisher connection closed. Scheduling reconnection with backoff...');
      cleanup();
      scheduleReconnect();
    });

    // Create a confirm channel for publisher confirms
    channel = await connection.createConfirmChannel();

    channel.on('error', (err) => {
      logger.error({ err: err.message }, 'RabbitMQ publisher channel error');
    });

    channel.on('close', () => {
      logger.warn('RabbitMQ publisher channel closed.');
      channel = null;
    });

    // Assert durable topic exchange
    await channel.assertExchange(config.exchangeName, 'topic', { durable: true });

    reconnectAttempts = 0;
    logger.info({ exchange: config.exchangeName }, 'Connected to RabbitMQ with Confirm Channel and durable exchange');
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to connect RabbitMQ publisher. Scheduling reconnection...');
    cleanup();
    scheduleReconnect();
  } finally {
    isConnecting = false;
  }
}

function cleanup() {
  channel = null;
  connection = null;
}

function scheduleReconnect() {
  if (reconnectTimer || config.nodeEnv === 'test') return;
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
  logger.info({ attempt: reconnectAttempts, delayMs: delay }, 'Scheduling RabbitMQ publisher reconnect');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    initRabbitMQ();
  }, delay);
}

/**
 * Publish an expense event to RabbitMQ using Publisher Confirms
 * Guarantees broker has persisted the message before resolving.
 * Returns true if confirmed by broker, false if channel unavailable or rejected.
 */
async function publishExpenseCreated(eventData) {
  if (config.nodeEnv === 'test') {
    logger.debug({ transactionId: eventData.transactionId }, 'Test mode: Mock published expense event');
    return true;
  }

  try {
    if (!channel) {
      logger.error({
        transactionId: eventData.transactionId,
        userId: eventData.userId
      }, 'CRITICAL: RabbitMQ channel not available. Event could not be published (message lost without Outbox pattern)');
      return false;
    }

    const payload = Buffer.from(JSON.stringify(eventData));

    // Publisher confirm via callback
    const confirmed = await new Promise((resolve, reject) => {
      channel.publish(
        config.exchangeName,
        config.routingKeyExpense,
        payload,
        {
          persistent: true, // Message durability
          contentType: 'application/json',
          timestamp: Date.now()
        },
        (err) => {
          if (err) return reject(err);
          resolve(true);
        }
      );
    });

    if (confirmed) {
      logger.info({
        transactionId: eventData.transactionId,
        userId: eventData.userId
      }, 'Expense event successfully published and confirmed by RabbitMQ broker');
    }

    return confirmed;
  } catch (err) {
    logger.error({
      err: err.message,
      transactionId: eventData.transactionId,
      userId: eventData.userId
    }, 'Failed to publish expense event to RabbitMQ broker');
    return false;
  }
}

/**
 * Clean shutdown for RabbitMQ publisher
 */
async function closeRabbitMQ() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    if (channel) {
      await channel.waitForConfirms();
      await channel.close().catch(() => {});
    }
    if (connection) {
      await connection.close().catch(() => {});
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Error closing RabbitMQ publisher');
  } finally {
    cleanup();
  }
}

module.exports = {
  initRabbitMQ,
  publishExpenseCreated,
  closeRabbitMQ,
  scheduleReconnect
};
