const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment configuration from service .env, root .env, or process.cwd()
const serviceEnvPath = path.resolve(__dirname, '../../.env');
const rootEnvPath = path.resolve(__dirname, '../../../../.env');

if (fs.existsSync(serviceEnvPath)) {
  dotenv.config({ path: serviceEnvPath });
}
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}
dotenv.config();

const internalServiceSecret = process.env.INTERNAL_SERVICE_SECRET || 
  (process.env.NODE_ENV === 'test' ? 'test_internal_secret_32_characters' : 'fintrack_internal_cluster_secret_fallback_2026_key_32chars');

const mongoUri = process.env.NOTIFICATION_MONGO_URI || process.env.MONGO_URI || process.env.MONGODB_URI || process.env.ATLAS_URI || (process.env.NODE_ENV === 'test' ? 'mongodb://127.0.0.1:27020/fintrack_notifications_test' : '');
const dbName = process.env.NOTIFICATION_DB_NAME || process.env.DB_NAME || 'fintrack_notifications';

if (!mongoUri && process.env.NODE_ENV !== 'test') {
  throw new Error('FATAL: MongoDB URI configuration is missing for Notification Service. Please define NOTIFICATION_MONGO_URI or MONGO_URI.');
}

module.exports = {
  port: Number(process.env.NOTIFICATION_PORT) || (process.env.PORT && Number(process.env.PORT) !== 8000 ? Number(process.env.PORT) : 5003),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri,
  dbName,
  rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
  exchangeName: process.env.EXCHANGE_NAME || 'fintrack_events',
  queueName: process.env.QUEUE_NAME || 'notifications_expense_queue',
  routingKeyExpense: process.env.ROUTING_KEY_EXPENSE || 'expense.created',
  defaultAlertThreshold: Number(process.env.DEFAULT_ALERT_THRESHOLD) || 10000,
  maxRetries: Number(process.env.MAX_RETRIES) || 3,
  retryDelayMs: Number(process.env.RETRY_DELAY_MS) || 5000,
  dlxName: process.env.DLX_NAME || 'fintrack_dlx',
  dlqName: process.env.DLQ_NAME || 'notifications_expense_dlq',
  retryQueueName: process.env.RETRY_QUEUE_NAME || 'notifications_expense_retry_queue',
  internalServiceSecret
};
