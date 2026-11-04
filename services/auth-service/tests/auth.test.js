const request = require('supertest');
const app = require('../src/app');

describe('Auth Service API Tests', () => {
  describe('GET /health', () => {
    it('should return service name and status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('auth-service');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('POST /register', () => {
    it('should register a new user successfully and return tokens', async () => {
      const res = await request(app)
        .post('/register')
        .send({
          name: 'Aditya Tiwari',
          email: 'aditya@example.com',
          password: 'Password@123'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe('aditya@example.com');
      expect(res.body.data.user.name).toBe('Aditya Tiwari');
      expect(res.body.data.user.password).toBeUndefined();
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
    });

    it('should reject registration with duplicate email', async () => {
      await request(app)
        .post('/register')
        .send({
          name: 'User One',
          email: 'duplicate@example.com',
          password: 'Password@123'
        });

      const res = await request(app)
        .post('/register')
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
        .send({
          name: 'Login Test',
          email: 'login@example.com',
          password: 'CorrectPassword123'
        });
    });

    it('should login with correct credentials and return tokens', async () => {
      const res = await request(app)
        .post('/login')
        .send({
          email: 'login@example.com',
          password: 'CorrectPassword123'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.email).toBe('login@example.com');
    });

    it('should reject login with wrong password', async () => {
      const res = await request(app)
        .post('/login')
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
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('profile@example.com');
      expect(res.body.data.user.name).toBe('Profile Tester');
      expect(res.body.data.user.password).toBeUndefined();
    });

    it('should return 401 when no token is provided', async () => {
      const res = await request(app).get('/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 when invalid token is provided', async () => {
      const res = await request(app)
        .get('/me')
        .set('Authorization', 'Bearer invalid_garbage_token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /refresh', () => {
    let refreshToken;

    beforeEach(async () => {
      const reg = await request(app)
        .post('/register')
        .send({
          name: 'Refresh Tester',
          email: 'refresh@example.com',
          password: 'Password@123'
        });
      refreshToken = reg.body.data.refreshToken;
    });

    it('should rotate tokens with valid refresh token', async () => {
      const res = await request(app)
        .post('/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.refreshToken).not.toBe(refreshToken);

      // Consumed token cannot be reused
      const secondRes = await request(app)
        .post('/refresh')
        .send({ refreshToken });

      expect(secondRes.status).toBe(401);
      expect(secondRes.body.error.code).toBe('TOKEN_REUSE_DETECTED');
    });

    it('should return 401 for invalid refresh token', async () => {
      const res = await request(app)
        .post('/refresh')
        .send({ refreshToken: 'random_invalid_token' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
