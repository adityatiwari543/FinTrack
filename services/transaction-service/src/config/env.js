const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  port: process.env.PORT || 5002,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/fintrack_transactions',
  rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
  exchangeName: process.env.EXCHANGE_NAME || 'fintrack_events',
  routingKeyExpense: process.env.ROUTING_KEY_EXPENSE || 'expense.created'
};
