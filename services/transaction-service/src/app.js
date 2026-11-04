const express = require('express');
const cors = require('cors');
const transactionRoutes = require('./routes/transaction.routes');
const requestLogger = require('./middlewares/requestLogger.middleware');
const errorHandler = require('./middlewares/error.middleware');

const app = express();

app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Health check mounted at root as well
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'transaction-service',
    timestamp: new Date().toISOString()
  });
});

// Transaction routes (supports both direct and gateway proxied paths)
app.use('/', transactionRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      code: 'NOT_FOUND'
    }
  });
});

// Centralized error handler
app.use(errorHandler);

module.exports = app;
