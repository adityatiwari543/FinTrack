const express = require('express');
const cors = require('cors');
const requestLogger = require('./middlewares/requestLogger.middleware');
const rateLimiter = require('./middlewares/rateLimiter.middleware');
const errorHandler = require('./middlewares/error.middleware');
const proxyRoutes = require('./routes/proxy.routes');
const config = require('./config/env');

const app = express();

// Trust proxy headers if behind reverse proxy
app.set('trust proxy', 1);

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, postman) or configured frontend
    if (!origin || origin === config.frontendUrl || origin === 'http://localhost:5173' || origin === 'http://localhost:3000') {
      callback(null, true);
    } else {
      callback(null, true); // Permissive in dev/docker environments
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id']
}));

// Request logger with request ID propagation
app.use(requestLogger);

// Rate limiter
app.use(rateLimiter);

// Express json parser for non-proxy or pre-parsed bodies
app.use(express.json());

// Gateway health endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    routes: {
      auth: config.authServiceUrl,
      transactions: config.transactionServiceUrl,
      notifications: config.notificationServiceUrl
    }
  });
});

// Proxy routes mounted under /api
app.use('/api', proxyRoutes);

// Fallback 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Endpoint not found on gateway: ${req.method} ${req.originalUrl}`,
      code: 'NOT_FOUND'
    }
  });
});

// Centralized error handler
app.use(errorHandler);

module.exports = app;
