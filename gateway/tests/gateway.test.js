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
  });

  describe('404 Handling', () => {
    it('should return consistent JSON 404 for unknown endpoints', async () => {
      const res = await request(app).get('/unknown/random/endpoint');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
