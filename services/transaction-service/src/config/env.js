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

const internalServiceSecret = process.env.INTERNAL_SERVICE_SECRET || (process.env.NODE_ENV === 'test' ? 'test_internal_secret_32_characters' : '');

if (process.env.NODE_ENV === 'production' && !internalServiceSecret) {
  throw new Error('FATAL: INTERNAL_SERVICE_SECRET is required in production');
}

const mongoUri = process.env.TRANSACTION_MONGO_URI || process.env.MONGO_URI || process.env.MONGODB_URI || process.env.ATLAS_URI || (process.env.NODE_ENV === 'test' ? 'mongodb://127.0.0.1:27019/fintrack_transactions_test' : '');
const dbName = process.env.TRANSACTION_DB_NAME || process.env.DB_NAME || 'fintrack_transactions';

if (!mongoUri && process.env.NODE_ENV !== 'test') {
  throw new Error('FATAL: MongoDB URI configuration is missing for Transaction Service. Please define TRANSACTION_MONGO_URI or MONGO_URI.');
}

module.exports = {
  port: Number(process.env.TRANSACTION_PORT) || (process.env.PORT && Number(process.env.PORT) !== 8000 ? Number(process.env.PORT) : 5002),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri,
  dbName,
  rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
  exchangeName: process.env.EXCHANGE_NAME || 'fintrack_events',
  routingKeyExpense: process.env.ROUTING_KEY_EXPENSE || 'expense.created',
  internalServiceSecret
};
