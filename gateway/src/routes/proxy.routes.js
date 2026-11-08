const express = require('express');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const config = require('../config/env');
const { verifyGatewayToken } = require('../middlewares/auth.middleware');
const logger = require('../utils/logger');

const router = express.Router();

function createServiceProxy(targetGetter, pathRewrite) {
  const getTarget = typeof targetGetter === 'function' ? targetGetter : () => targetGetter;
  return createProxyMiddleware({
    target: getTarget(),
    router: () => getTarget(),
    changeOrigin: true,
    pathRewrite,
    timeout: 60000,
    proxyTimeout: 60000,
    on: {
      proxyReq: (proxyReq, req, res) => {
        // Forward request id
        if (req.id) {
          proxyReq.setHeader('x-request-id', req.id);
        }
        // Always strip client-provided internal headers and inject verified server internal secret
        proxyReq.removeHeader('x-internal-token');
        proxyReq.removeHeader('x-user-id');
        proxyReq.removeHeader('x-user-email');

        if (config.internalServiceSecret) {
          proxyReq.setHeader('x-internal-token', config.internalServiceSecret);
        }
        // Forward verified user headers only if authenticated by verifyGatewayToken
        if (req.user && req.headers['x-user-id']) {
          proxyReq.setHeader('x-user-id', req.headers['x-user-id']);
        }
        if (req.user && req.headers['x-user-email']) {
          proxyReq.setHeader('x-user-email', req.headers['x-user-email']);
        }
        // Re-stream body if parsed by express.json()
        if (req.body && Object.keys(req.body).length > 0) {
          fixRequestBody(proxyReq, req);
        }
      },
      proxyRes: (proxyRes, req, res) => {
        // Strip downstream microservice CORS headers so API Gateway's CORS middleware controls the response
        delete proxyRes.headers['access-control-allow-origin'];
        delete proxyRes.headers['access-control-allow-credentials'];
        delete proxyRes.headers['access-control-allow-methods'];
        delete proxyRes.headers['access-control-allow-headers'];
      },
      error: (err, req, res) => {
        try {
          const downstreamTarget = getTarget();
          const requestId = req?.id || req?.headers?.['x-request-id'] || undefined;

          logger.error({
            err: err?.message || 'Downstream connection error',
            code: err?.code || 'DOWNSTREAM_ERROR',
            target: downstreamTarget,
            path: req?.originalUrl || req?.url,
            requestId
          }, 'API Gateway proxy downstream error');

          if (res && !res.headersSent && typeof res.status === 'function') {
            if (requestId) {
              res.setHeader('x-request-id', requestId);
            }
            res.status(502).json({
              success: false,
              error: {
                message: 'Target service temporarily unavailable. Downstream service unreachable.',
                code: 'BAD_GATEWAY',
                requestId
              }
            });
          }
        } catch (handlerErr) {
          logger.error({ handlerErr }, 'Unexpected error in proxy error handler');
          if (res && !res.headersSent && typeof res.status === 'function') {
            res.status(502).json({
              success: false,
              error: {
                message: 'Downstream service unavailable.',
                code: 'BAD_GATEWAY'
              }
            });
          }
        }
      }
    }
  });
}

// 1. Auth Service Routes (Public registration/login/refresh, protected /me)
// Proxy /api/auth/* -> Auth Service /...
router.use('/auth', createServiceProxy(() => config.authServiceUrl, {
  '^/api/auth': ''
}));

// 2. Transaction Service Routes (Protected)
// Proxy /api/transactions/* -> Transaction Service /transactions...
router.use('/transactions', verifyGatewayToken, createServiceProxy(() => config.transactionServiceUrl, {
  '^/api/transactions': '/transactions'
}));

// 3. Notification Service Routes (Protected)
// Proxy /api/notifications/* -> Notification Service /notifications...
router.use('/notifications', verifyGatewayToken, createServiceProxy(() => config.notificationServiceUrl, {
  '^/api/notifications': '/notifications'
}));

// Proxy /api/settings/* -> Notification Service /settings...
router.use('/settings', verifyGatewayToken, createServiceProxy(() => config.notificationServiceUrl, {
  '^/api/settings': '/settings'
}));

module.exports = router;
