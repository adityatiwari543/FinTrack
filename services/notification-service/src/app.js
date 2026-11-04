const express = require('express');
const cors = require('cors');
const notificationRoutes = require('./routes/notification.routes');
const requestLogger = require('./middlewares/requestLogger.middleware');
const errorHandler = require('./middlewares/error.middleware');

const app = express();

app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Root health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'notification-service',
    timestamp: new Date().toISOString()
  });
});

// Mount notification & settings routes
app.use('/', notificationRoutes);

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
