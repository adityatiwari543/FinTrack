const amqp = require('amqplib');
const config = require('../config/env');
const logger = require('../utils/logger');

let connection = null;
let channel = null;
let isConnecting = false;

async function initRabbitMQ() {
  if (config.nodeEnv === 'test') {
    logger.info('Test environment: RabbitMQ connection skipped');
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
      setTimeout(initRabbitMQ, 5000);
    });

    channel = await connection.createChannel();
    await channel.assertExchange(config.exchangeName, 'topic', { durable: true });

    logger.info({ exchange: config.exchangeName }, 'Connected to RabbitMQ and asserted exchange');
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to connect to RabbitMQ broker (will retry in 5s)');
    channel = null;
    connection = null;
    setTimeout(initRabbitMQ, 5000);
  } finally {
    isConnecting = false;
  }
}

/**
 * Publish an expense event to RabbitMQ
 * Durable message, non-blocking (fails gracefully if broker is temporarily down)
 */
async function publishExpenseCreated(eventData) {
  if (config.nodeEnv === 'test') {
    logger.debug({ eventData }, 'Test mode: Mock published expense event');
    return true;
  }

  try {
    if (!channel) {
      logger.warn('RabbitMQ channel not ready. Event skipped (async decoupling).');
      return false;
    }

    const payload = Buffer.from(JSON.stringify(eventData));
    const published = channel.publish(
      config.exchangeName,
      config.routingKeyExpense,
      payload,
      {
        persistent: true, // message is durable
        contentType: 'application/json',
        timestamp: Date.now()
      }
    );

    if (published) {
      logger.info({
        transactionId: eventData.transactionId,
        amount: eventData.amount,
        userId: eventData.userId
      }, 'Successfully published expense event to RabbitMQ');
    }

    return published;
  } catch (err) {
    // Non-blocking: never let notification publishing failure fail transaction creation
    logger.error({ err: err.message, transactionId: eventData.transactionId }, 'Error publishing expense event');
    return false;
  }
}

async function closeRabbitMQ() {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
  } catch (err) {
    logger.error({ err }, 'Error closing RabbitMQ connection');
  }
}

module.exports = {
  initRabbitMQ,
  publishExpenseCreated,
  closeRabbitMQ
};
