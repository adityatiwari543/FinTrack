const express = require('express');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const config = require('../config/env');
const { verifyGatewayToken } = require('../middlewares/auth.middleware');
const logger = require('../utils/logger');

const router = express.Router();

function createServiceProxy(target, pathRewrite) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    on: {
      proxyReq: (proxyReq, req, res) => {
        // Forward request id
        if (req.id) {
          proxyReq.setHeader('x-request-id', req.id);
        }
        // Forward verified user headers if authenticated
        if (req.headers['x-user-id']) {
          proxyReq.setHeader('x-user-id', req.headers['x-user-id']);
        }
        if (req.headers['x-user-email']) {
          proxyReq.setHeader('x-user-email', req.headers['x-user-email']);
        }
        // Re-stream body if parsed by express.json()
        if (req.body && Object.keys(req.body).length > 0) {
          fixRequestBody(proxyReq, req);
        }
      },
      error: (err, req, res) => {
        logger.error({ err: err.message, target, url: req.originalUrl }, 'Proxy downstream error');
        if (!res.headersSent) {
          res.status(503).json({
            success: false,
            error: {
              message: 'Target service temporarily unavailable. Please retry shortly.',
              code: 'SERVICE_UNAVAILABLE',
              details: process.env.NODE_ENV === 'development' ? err.message : undefined
            }
          });
        }
      }
    }
  });
}

// 1. Auth Service Routes (Public registration/login/refresh, protected /me)
// Proxy /api/auth/* -> Auth Service /...
router.use('/auth', createServiceProxy(config.authServiceUrl, {
  '^/api/auth': ''
}));

// 2. Transaction Service Routes (Protected)
// Proxy /api/transactions/* -> Transaction Service /transactions...
router.use('/transactions', verifyGatewayToken, createServiceProxy(config.transactionServiceUrl, {
  '^/api/transactions': '/transactions'
}));

// 3. Notification Service Routes (Protected)
// Proxy /api/notifications/* -> Notification Service /notifications...
router.use('/notifications', verifyGatewayToken, createServiceProxy(config.notificationServiceUrl, {
  '^/api/notifications': '/notifications'
}));

// Proxy /api/settings/* -> Notification Service /settings...
router.use('/settings', verifyGatewayToken, createServiceProxy(config.notificationServiceUrl, {
  '^/api/settings': '/settings'
}));

module.exports = router;
