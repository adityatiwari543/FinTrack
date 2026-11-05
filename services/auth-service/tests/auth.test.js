const request = require('supertest');
const app = require('../src/app');
const config = require('../src/config/env');

const INTERNAL_TOKEN = 'test_internal_secret_32_characters';

describe('Auth Service API Tests', () => {
  describe('GET /health (Public Infrastructure)', () => {
    it('should return service name and status ok without internal token', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('auth-service');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('Internal Gateway Authentication Security', () => {
    it('should reject request missing x-internal-token with 403', async () => {
      const res = await request(app)
        .post('/register')
        .send({
          name: 'Attacker',
          email: 'attacker@example.com',
          password: 'Password@123'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN_DIRECT_ACCESS');
    });

    it('should reject request with invalid x-internal-token with 403', async () => {
      const res = await request(app)
        .post('/register')
        .set('x-internal-token', 'wrong_fake_internal_secret')
        .send({
          name: 'Attacker',
          email: 'attacker@example.com',
          password: 'Password@123'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_INTERNAL_TOKEN');
    });

    it('should accept request with valid x-internal-token', async () => {
      const res = await request(app)
        .post('/register')
        .set('x-internal-token', INTERNAL_TOKEN)
        .send({
          name: 'Aditya Tiwari',
          email: 'aditya@example.com',
          password: 'Password@123'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /register', () => {
    it('should register a new user successfully, return access token in JSON, and set httpOnly cookie (no refresh token in JSON)', async () => {
      const res = await request(app)
        .post('/register')
        .set('x-internal-token', INTERNAL_TOKEN)
        .send({
          name: 'Aditya Tiwari',
          email: 'aditya_new@example.com',
          password: 'Password@123'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe('aditya_new@example.com');
      expect(res.body.data.user.name).toBe('Aditya Tiwari');
      expect(res.body.data.user.password).toBeUndefined();
      expect(res.body.data.accessToken).toBeDefined();
      // Crucial security requirement: refresh token MUST NOT be exposed in JSON
      expect(res.body.data.refreshToken).toBeUndefined();

      // Crucial security requirement: refresh token set as httpOnly cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some(c => c.includes('refreshToken=') && c.includes('HttpOnly'))).toBe(true);
    });

    it('should reject registration with duplicate email', async () => {
      await request(app)
        .post('/register')
        .set('x-internal-token', INTERNAL_TOKEN)
        .send({
          name: 'User One',
          email: 'duplicate@example.com',
          password: 'Password@123'
        });

      const res = await request(app)
        .post('/register')
        .set('x-internal-token', INTERNAL_TOKEN)
        .send({
          name: 'User Two',
          email: 'duplicate@example.com',
          password: 'Password@123'
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('USER_EXISTS');
    });

    it('should return 400 validation error for invalid email and short password', async () => {
      const res = await request(app)
        .post('/register')
        .set('x-internal-token', INTERNAL_TOKEN)
        .send({
          name: 'A',
          email: 'not-an-email',
          password: '123'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });
  });

  describe('POST /login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/register')
        .set('x-internal-token', INTERNAL_TOKEN)
        .send({
          name: 'Login Test',
          email: 'login@example.com',
          password: 'CorrectPassword123'
        });
    });

    it('should login with correct credentials, return access token, and set httpOnly cookie (no refresh token in JSON)', async () => {
      const res = await request(app)
        .post('/login')
        .set('x-internal-token', INTERNAL_TOKEN)
        .send({
          email: 'login@example.com',
          password: 'CorrectPassword123'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      // No refresh token in JSON body
      expect(res.body.data.refreshToken).toBeUndefined();
      expect(res.body.data.user.email).toBe('login@example.com');

      // Refresh token is in httpOnly cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some(c => c.includes('refreshToken=') && c.includes('HttpOnly'))).toBe(true);
    });

    it('should reject login with wrong password', async () => {
      const res = await request(app)
        .post('/login')
        .set('x-internal-token', INTERNAL_TOKEN)
        .send({
          email: 'login@example.com',
          password: 'WrongPassword'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login with non-existent email', async () => {
      const res = await request(app)
        .post('/login')
        .set('x-internal-token', INTERNAL_TOKEN)
        .send({
          email: 'nonexistent@example.com',
          password: 'CorrectPassword123'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('GET /me', () => {
    let accessToken;

    beforeEach(async () => {
      const reg = await request(app)
        .post('/register')
        .set('x-internal-token', INTERNAL_TOKEN)
        .send({
          name: 'Profile Tester',
          email: 'profile@example.com',
          password: 'Password@123'
        });
      accessToken = reg.body.data.accessToken;
    });

    it('should return user profile with valid Bearer token', async () => {
      const res = await request(app)
        .get('/me')
        .set('x-internal-token', INTERNAL_TOKEN)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('profile@example.com');
      expect(res.body.data.user.name).toBe('Profile Tester');
      expect(res.body.data.user.password).toBeUndefined();
    });

    it('should return 401 when no token is provided', async () => {
      const res = await request(app)
        .get('/me')
        .set('x-internal-token', INTERNAL_TOKEN);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 when invalid token is provided', async () => {
      const res = await request(app)
        .get('/me')
        .set('x-internal-token', INTERNAL_TOKEN)
        .set('Authorization', 'Bearer invalid_garbage_token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /refresh and POST /logout', () => {
    let refreshCookie;

    beforeEach(async () => {
      const reg = await request(app)
        .post('/register')
        .set('x-internal-token', INTERNAL_TOKEN)
        .send({
          name: 'Refresh Tester',
          email: 'refresh@example.com',
          password: 'Password@123'
        });
      // Extract the refreshToken cookie string from set-cookie header
      const cookies = reg.headers['set-cookie'];
      refreshCookie = cookies.find(c => c.startsWith('refreshToken=')).split(';')[0];
    });

    it('should rotate tokens when reading refresh token from httpOnly cookie', async () => {
      const res = await request(app)
        .post('/refresh')
        .set('x-internal-token', INTERNAL_TOKEN)
        .set('Cookie', refreshCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      // Crucial: no refresh token in JSON
      expect(res.body.data.refreshToken).toBeUndefined();

      // Rotated new cookie must be set
      const newCookies = res.headers['set-cookie'];
      expect(newCookies).toBeDefined();
      const newRefreshCookie = newCookies.find(c => c.startsWith('refreshToken=')).split(';')[0];
      expect(newRefreshCookie).not.toBe(refreshCookie);

      // Old consumed token cannot be reused
      const secondRes = await request(app)
        .post('/refresh')
        .set('x-internal-token', INTERNAL_TOKEN)
        .set('Cookie', refreshCookie);

      expect(secondRes.status).toBe(401);
      expect(secondRes.body.error.code).toBe('TOKEN_REUSE_DETECTED');
    });

    it('should return 401 when no refresh token cookie or body is sent', async () => {
      const res = await request(app)
        .post('/refresh')
        .set('x-internal-token', INTERNAL_TOKEN);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('REFRESH_TOKEN_REQUIRED');
    });

    it('should return 401 for invalid refresh token', async () => {
      const res = await request(app)
        .post('/refresh')
        .set('x-internal-token', INTERNAL_TOKEN)
        .set('Cookie', 'refreshToken=invalid_garbage_token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should logout, revoke session from database, and clear refresh-token cookie', async () => {
      const res = await request(app)
        .post('/logout')
        .set('x-internal-token', INTERNAL_TOKEN)
        .set('Cookie', refreshCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Logged out successfully');

      // Cookie must be cleared (Max-Age=0 or Expires in past)
      const cookies = res.headers['set-cookie'];
      expect(cookies.some(c => c.includes('refreshToken=;') || c.includes('Max-Age=0') || c.includes('expires='))).toBe(true);

      // Revoked token cannot be used to refresh
      const checkRes = await request(app)
        .post('/refresh')
        .set('x-internal-token', INTERNAL_TOKEN)
        .set('Cookie', refreshCookie);

      expect(checkRes.status).toBe(401);
    });
  });

  describe('Production Cookie Security Attributes', () => {
    it('should set Secure and Strict SameSite attributes in production', () => {
      const originalEnv = config.nodeEnv;
      const originalSecure = config.cookieSecure;
      const originalSameSite = config.cookieSameSite;

      config.cookieSecure = true;
      config.cookieSameSite = 'strict';

      const { getCookieOptions } = require('../src/controllers/auth.controller');
      const opts = getCookieOptions();

      expect(opts.httpOnly).toBe(true);
      expect(opts.secure).toBe(true);
      expect(opts.sameSite).toBe('strict');
      expect(opts.path).toBe('/api/auth');

      config.cookieSecure = originalSecure;
      config.cookieSameSite = originalSameSite;
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
