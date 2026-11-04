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

// CORS configuration with explicit origins and credentials
const isOriginAllowed = (origin) => {
  if (!origin) return true; // Server-to-server, curl, Postman
  return config.allowedOrigins && config.allowedOrigins.includes(origin);
};

app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      const err = new Error(`Origin ${origin} not allowed by CORS`);
      err.status = 403;
      err.code = 'CORS_ORIGIN_DENIED';
      callback(err);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id']
}));

// Request logger with request ID propagation
app.use(requestLogger);

// Security: Strip untrusted client-supplied identity & internal tokens
app.use((req, res, next) => {
  delete req.headers['x-user-id'];
  delete req.headers['x-user-email'];
  delete req.headers['x-internal-token'];
  next();
});

// CSRF Origin validation for cookie-authenticated endpoints
app.use('/api/auth', (req, res, next) => {
  if (req.method === 'POST' && (req.path === '/refresh' || req.path === '/logout')) {
    const origin = req.headers.origin;
    if (origin && !isOriginAllowed(origin)) {
      return res.status(403).json({
        success: false,
        error: {
          message: `CSRF validation rejected: origin '${origin}' is not trusted`,
          code: 'CSRF_ORIGIN_INVALID'
        }
      });
    }
  }
  next();
});

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
