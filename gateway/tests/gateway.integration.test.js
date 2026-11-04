/**
 * API Gateway Real HTTP Network Integration Tests (Phase C)
 * 
 * Verifies real TCP/HTTP network communication between API Gateway and downstream services:
 * - Real ephemeral TCP socket servers (listen(0))
 * - Real JWT verification and header injection
 * - Anti-spoofing header sanitization (x-user-id & x-internal-token)
 * - Request ID propagation across real network calls
 * - Downstream error propagation
 */

try {
  require('../../tests/integration/setup');
} catch (e) {}

const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const config = require('../src/config/env');

describe('API Gateway Real HTTP Network Integration Tests (Phase C)', () => {
  const jwtSecret = config.jwtSecret;
  const internalSecret = config.internalServiceSecret;
  const testUserId = 'user_672b1234567890abcdef9999';

  let downstreamApp;
  let downstreamServer;
  let downstreamPort;
  let downstreamUrl;

  let gatewayApp;
  let gatewayServer;
  let gatewayPort;
  let gatewayUrl;

  let receivedDownstreamHeaders = null;

  beforeAll(async () => {
    // 1. Create a real downstream HTTP service
    downstreamApp = express();
    downstreamApp.use(express.json());

    // Middleware checking x-internal-token
    downstreamApp.use((req, res, next) => {
      receivedDownstreamHeaders = { ...req.headers };
      const internalToken = req.headers['x-internal-token'];
      if (!internalToken || internalToken !== internalSecret) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN_DIRECT_ACCESS', message: 'Direct access denied' }
        });
      }
      next();
    });

    downstreamApp.get('/test-endpoint', (req, res) => {
      res.status(200).json({
        success: true,
        data: {
          receivedUserId: req.headers['x-user-id'],
          receivedInternalToken: req.headers['x-internal-token'],
          receivedRequestId: req.headers['x-request-id']
        }
      });
    });

    downstreamApp.get('/error-endpoint', (req, res) => {
      res.status(400).json({
        success: false,
        error: { code: 'DOWNSTREAM_VALIDATION_ERROR', message: 'Invalid payload' }
      });
    });

    // Start downstream server on ephemeral port
    downstreamServer = http.createServer(downstreamApp);
    await new Promise((resolve) => downstreamServer.listen(0, '127.0.0.1', resolve));
    downstreamPort = downstreamServer.address().port;
    downstreamUrl = `http://127.0.0.1:${downstreamPort}`;

    // Mutate config targets dynamically
    config.transactionServiceUrl = downstreamUrl;
    config.authServiceUrl = downstreamUrl;
    config.notificationServiceUrl = downstreamUrl;

    gatewayApp = require('../src/app');

    // Start gateway server on ephemeral port
    gatewayServer = http.createServer(gatewayApp);
    await new Promise((resolve) => gatewayServer.listen(0, '127.0.0.1', resolve));
    gatewayPort = gatewayServer.address().port;
    gatewayUrl = `http://127.0.0.1:${gatewayPort}`;
  });

  afterAll(async () => {
    if (gatewayServer) await new Promise((res) => gatewayServer.close(res));
    if (downstreamServer) await new Promise((res) => downstreamServer.close(res));
  });

  beforeEach(() => {
    receivedDownstreamHeaders = null;
  });

  function generateToken(payload, secret = config.jwtSecret, expiresIn = '1h') {
    const defaultPayload = { userId: testUserId, id: testUserId, email: 'verified@fintrack.app' };
    return jwt.sign({ ...defaultPayload, ...payload }, secret, { expiresIn });
  }

  it('Requirement 1 & 2 & 5: Valid JWT requests forward through Gateway and inject verified x-user-id', async () => {
    const token = generateToken({ sub: testUserId, email: 'verified@fintrack.app' });

    const res = await request(gatewayServer)
      .get('/api/transactions/test-endpoint')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify downstream service received the verified x-user-id and valid x-internal-token
    expect(receivedDownstreamHeaders['x-user-id']).toBe(testUserId);
    expect(receivedDownstreamHeaders['x-internal-token']).toBe(internalSecret);
  });

  it('Requirement 3: Invalid JWT is rejected by Gateway with 401 without contacting downstream', async () => {
    const res = await request(gatewayServer)
      .get('/api/transactions/test-endpoint')
      .set('Authorization', 'Bearer invalid.tampered.token');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_TOKEN');

    // Confirm downstream was never touched
    expect(receivedDownstreamHeaders).toBeNull();
  });

  it('Requirement 4: Expired JWT is rejected with 401', async () => {
    const expiredToken = generateToken({}, config.jwtSecret, '-10s');

    const res = await request(gatewayServer)
      .get('/api/transactions/test-endpoint')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    expect(receivedDownstreamHeaders).toBeNull();
  });

  it('Requirement 6: Client-supplied x-user-id cannot spoof identity (Gateway strips & replaces with JWT sub)', async () => {
    const realUserToken = generateToken({ sub: testUserId });
    const forgedUserId = 'attacker_spoofed_victim_1234';

    const res = await request(gatewayServer)
      .get('/api/transactions/test-endpoint')
      .set('Authorization', `Bearer ${realUserToken}`)
      .set('x-user-id', forgedUserId); // Malicious forgery attempt

    expect(res.status).toBe(200);
    // Downstream MUST receive the real JWT sub, NOT the spoofed header
    expect(receivedDownstreamHeaders['x-user-id']).toBe(testUserId);
    expect(receivedDownstreamHeaders['x-user-id']).not.toBe(forgedUserId);
  });

  it('Requirement 7: Client-supplied internal authentication headers cannot override Gateway credentials', async () => {
    const token = generateToken({ sub: testUserId });
    const forgedSecret = 'hacker_injected_secret_override';

    const res = await request(gatewayServer)
      .get('/api/transactions/test-endpoint')
      .set('Authorization', `Bearer ${token}`)
      .set('x-internal-token', forgedSecret);

    expect(res.status).toBe(200);
    // Gateway must enforce its own INTERNAL_SERVICE_SECRET
    expect(receivedDownstreamHeaders['x-internal-token']).toBe(internalSecret);
  });

  it('Requirement 8: Direct HTTP requests to downstream service without valid internal token are rejected with 403', async () => {
    // Calling downstream directly (bypassing Gateway) without token
    const directRes = await request(downstreamServer)
      .get('/test-endpoint');

    expect(directRes.status).toBe(403);
    expect(directRes.body.error.code).toBe('FORBIDDEN_DIRECT_ACCESS');

    // Calling downstream with incorrect internal token
    const badTokenRes = await request(downstreamServer)
      .get('/test-endpoint')
      .set('x-internal-token', 'wrong_secret');

    expect(badTokenRes.status).toBe(403);
  });

  it('Requirement 9: Request IDs are propagated across real HTTP network requests', async () => {
    const token = generateToken({ sub: testUserId });
    const customRequestId = 'req-trace-xyz-99999';

    const res = await request(gatewayServer)
      .get('/api/transactions/test-endpoint')
      .set('Authorization', `Bearer ${token}`)
      .set('x-request-id', customRequestId);

    expect(res.status).toBe(200);
    expect(receivedDownstreamHeaders['x-request-id']).toBe(customRequestId);
  });

  it('Requirement 10: Downstream service errors are returned consistently through the Gateway', async () => {
    const token = generateToken({ sub: testUserId });

    const res = await request(gatewayServer)
      .get('/api/transactions/error-endpoint')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('DOWNSTREAM_VALIDATION_ERROR');
  });
});
