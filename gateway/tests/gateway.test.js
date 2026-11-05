const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const config = require('../src/config/env');

describe('API Gateway Tests', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
  });

  describe('GET /health', () => {
    it('should return gateway status and service name', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('api-gateway');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('Request ID Propagation & Headers', () => {
    it('should generate x-request-id if not provided', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('should preserve incoming x-request-id', async () => {
      const customId = 'custom_req_12345';
      const res = await request(app)
        .get('/health')
        .set('x-request-id', customId);

      expect(res.headers['x-request-id']).toBe(customId);
    });
  });

  describe('Authentication Gatekeeping', () => {
    it('should reject access to /api/transactions without token', async () => {
      const res = await request(app).get('/api/transactions');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject access to /api/notifications without token', async () => {
      const res = await request(app).get('/api/notifications');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject access with invalid token', async () => {
      const res = await request(app)
        .get('/api/transactions')
        .set('Authorization', 'Bearer invalid_signature_token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should reject token without user identifier', async () => {
      const malformedToken = jwt.sign({ foo: 'bar' }, config.jwtSecret);
      const res = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${malformedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should reject spoofed x-user-id and x-internal-token without valid Bearer token', async () => {
      const res = await request(app)
        .get('/api/transactions')
        .set('x-user-id', 'spoofed_admin')
        .set('x-internal-token', 'spoofed_token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('CORS and CSRF Protection (Scenarios 8 & 9)', () => {
    it('should allow trusted frontend origin with credentials', async () => {
      const res = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:5173');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('Scenario 9: Untrusted CORS origin is rejected with 403', async () => {
      const res = await request(app)
        .get('/health')
        .set('Origin', 'http://malicious-site.com');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CORS_ORIGIN_DENIED');
    });

    it('Scenario 8: Invalid Origin is rejected for sensitive cookie-based endpoint with 403', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Origin', 'http://evil-attacker.com');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CORS_ORIGIN_DENIED');
    });
  });

  describe('404 Handling', () => {
    it('should return consistent JSON 404 for unknown endpoints', async () => {
      const res = await request(app).get('/unknown/random/endpoint');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Downstream Proxy Failure Handling (ECONNREFUSED / Service Unavailable)', () => {
    it('should return consistent JSON 502 Bad Gateway and preserve request id without crashing', async () => {
      const originalAuthUrl = config.authServiceUrl;
      config.authServiceUrl = 'http://127.0.0.1:49991';

      const customRequestId = 'req_proxy_fail_test_789';
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'Password123!' })
        .set('x-request-id', customRequestId);

      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('BAD_GATEWAY');
      expect(res.body.error.requestId).toBe(customRequestId);

      // Verify Gateway process remained alive and operational
      const healthRes = await request(app).get('/health');
      expect(healthRes.status).toBe(200);
      expect(healthRes.body.status).toBe('ok');

      config.authServiceUrl = originalAuthUrl;
    });
  });

  describe('Graceful Process Shutdown (SIGTERM/SIGINT)', () => {
    it('should cleanly execute gracefulShutdown without throwing', async () => {
      const { gracefulShutdown, getServer } = require('../src/index');
      await expect(gracefulShutdown('SIGTERM')).resolves.not.toThrow();
      expect(getServer()).toBeNull();
    });
  });
});
