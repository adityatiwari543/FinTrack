/**
 * FinTrack Integration Test Infrastructure Detection & Configuration Helper
 * 
 * Inspects host environment for live MongoDB and RabbitMQ availability.
 * Provides isolated test databases, test exchange names, and test queues.
 */

const net = require('net');

const TEST_CONFIG = {
  // Database URIs (strictly isolated in test namespace)
  authMongoUri: process.env.TEST_AUTH_MONGO_URI || 'mongodb://127.0.0.1:27018/fintrack_auth_test',
  transactionMongoUri: process.env.TEST_TRANSACTION_MONGO_URI || 'mongodb://127.0.0.1:27019/fintrack_transactions_test',
  notificationMongoUri: process.env.TEST_NOTIFICATION_MONGO_URI || 'mongodb://127.0.0.1:27020/fintrack_notifications_test',

  // RabbitMQ Broker & Queues (strictly isolated in test namespace)
  rabbitmqUrl: process.env.TEST_RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672',
  exchangeName: 'fintrack_test_events',
  dlxName: 'fintrack_test_dlx',
  queueName: 'test_notifications_expense_queue',
  retryQueueName: 'test_notifications_expense_retry_queue',
  dlqName: 'test_notifications_expense_dlq',
  routingKeyExpense: 'expense.created',

  // Internal security secret for test mesh
  internalServiceSecret: 'test_internal_secret_32_characters',

  // JWT Secret for tests
  jwtSecret: 'test_jwt_secret_key_minimum_32_characters'
};

/**
 * Check if a TCP port is open and listening
 */
function probePort(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      settled = true;
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(false);
      }
    });

    socket.on('error', () => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(false);
      }
    });

    try {
      socket.connect(port, host);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Determine if MongoDB is running and reachable on localhost or configured URI
 */
async function isMongoAvailable(port = 27018) {
  const primary = await probePort('127.0.0.1', port);
  if (primary) return true;
  return probePort('127.0.0.1', 27017);
}

/**
 * Determine if RabbitMQ is running and reachable on localhost or configured URI
 */
async function isRabbitMQAvailable() {
  return probePort('127.0.0.1', 5672);
}

module.exports = {
  TEST_CONFIG,
  isMongoAvailable,
  isRabbitMQAvailable,
  probePort
};
