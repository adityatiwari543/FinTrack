/**
 * Auth Service Real Infrastructure Integration Tests (Phase C)
 * Tests against real MongoDB instance (isolated database: fintrack_auth_test)
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { isMongoAvailable, TEST_CONFIG } = require('./infra-check');

describe('Auth Service Real MongoDB Integration Tests (Phase C)', () => {
  let mongoAvailable = false;
  let app;
  let User;
  const internalSecret = TEST_CONFIG.internalServiceSecret;

  beforeAll(async () => {
    mongoAvailable = await isMongoAvailable(27018);
    if (!mongoAvailable) {
      console.log('\n[INFRASTRUCTURE NOTICE]: Live MongoDB not reachable on 127.0.0.1:27018 (Auth Service). Auth Service real integration tests marked as NOT TESTED.\n');
      return;
    }

    process.env.USE_REAL_INFRA = 'true';
    process.env.NODE_ENV = 'test';
    process.env.MONGO_URI = TEST_CONFIG.authMongoUri;
    process.env.JWT_SECRET = TEST_CONFIG.jwtSecret;
    process.env.REFRESH_TOKEN_SECRET = TEST_CONFIG.jwtSecret;
    process.env.INTERNAL_SERVICE_SECRET = internalSecret;

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(TEST_CONFIG.authMongoUri);

    User = require('../../services/auth-service/src/models/user.model');
    await User.deleteMany({});
    await User.syncIndexes();

    app = require('../../services/auth-service/src/app');
  });

  afterAll(async () => {
    if (mongoAvailable) {
      try {
        await User.deleteMany({});
        await mongoose.connection.close();
      } catch (err) {
        console.error('Teardown error:', err.message);
      }
    }
  });

  const runIfMongo = (testFn) => {
    return async () => {
      if (!mongoAvailable) {
        console.log('Skipped (live MongoDB unavailable)');
        return;
      }
      return testFn();
    };
  };

  it('Requirement 1 & 2: User registration creates real database record with bcrypt hash', runIfMongo(async () => {
    const rawPassword = 'Password@123';
    const email = 'real.mongo.test@fintrack.app';

    const res = await request(app)
      .post('/register')
      .set('x-internal-token', internalSecret)
      .send({
        name: 'Real Mongo User',
        email,
        password: rawPassword
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(email);

    // Verify directly against real MongoDB
    const persisted = await User.findOne({ email });
    expect(persisted).not.toBeNull();
    expect(persisted.email).toBe(email);
    expect(persisted.password).not.toBe(rawPassword);
    expect(persisted.password).toMatch(/^\$2[aby]\$\d+\$/); // Valid bcrypt hash
  }));

  it('Requirement 3 & 10: Duplicate email registration rejected by real unique index', runIfMongo(async () => {
    const email = 'real.mongo.test@fintrack.app';

    const res = await request(app)
      .post('/register')
      .set('x-internal-token', internalSecret)
      .send({
        name: 'Duplicate User',
        email,
        password: 'Password@999'
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('EMAIL_EXISTS');

    // Verify index exists on real MongoDB
    const indexes = await User.collection.getIndexes();
    expect(indexes.email_1).toBeDefined();
    expect(indexes.email_1[0][0]).toBe('email');
  }));

  it('Requirement 4 & 5: Valid login issues access token & httpOnly cookie; invalid credentials rejected', runIfMongo(async () => {
    const email = 'real.mongo.test@fintrack.app';

    // Wrong password rejected
    const badLogin = await request(app)
      .post('/login')
      .set('x-internal-token', internalSecret)
      .send({ email, password: 'WrongPassword' });

    expect(badLogin.status).toBe(401);
    expect(badLogin.body.error.code).toBe('INVALID_CREDENTIALS');

    // Valid login
    const goodLogin = await request(app)
      .post('/login')
      .set('x-internal-token', internalSecret)
      .send({ email, password: 'Password@123' });

    expect(goodLogin.status).toBe(200);
    expect(goodLogin.body.data.accessToken).toBeDefined();

    const cookies = goodLogin.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toContain('refreshToken=');
    expect(cookies[0]).toContain('HttpOnly');

    // Verify refresh token hash is saved in MongoDB
    const user = await User.findOne({ email });
    expect(user.refreshTokens.length).toBeGreaterThan(0);
    expect(user.refreshTokens[0].tokenHash).toBeDefined();
  }));

  it('Requirement 6 & 7: Refresh token rotation works against real MongoDB and blocks old token reuse', runIfMongo(async () => {
    const email = 'rotation.test@fintrack.app';
    await request(app)
      .post('/register')
      .set('x-internal-token', internalSecret)
      .send({ name: 'Rotation User', email, password: 'Password@123' });

    const loginRes = await request(app)
      .post('/login')
      .set('x-internal-token', internalSecret)
      .send({ email, password: 'Password@123' });

    const initialCookie = loginRes.headers['set-cookie'][0].split(';')[0];
    const initialTokenValue = initialCookie.split('=')[1];

    // First rotation
    const refreshRes = await request(app)
      .post('/refresh')
      .set('x-internal-token', internalSecret)
      .set('Cookie', [initialCookie]);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toBeDefined();
    const rotatedCookie = refreshRes.headers['set-cookie'][0].split(';')[0];

    // Replay attack: attempt to use initial token again
    const reuseAttempt = await request(app)
      .post('/refresh')
      .set('x-internal-token', internalSecret)
      .set('Cookie', [`refreshToken=${initialTokenValue}`]);

    expect(reuseAttempt.status).toBe(401);

    // Verify real DB revoked sessions
    const userAfterReuse = await User.findOne({ email });
    expect(userAfterReuse.refreshTokens.length).toBe(0);
  }));

  it('Requirement 8: Logout revokes real session in MongoDB', runIfMongo(async () => {
    const email = 'logout.test@fintrack.app';
    await request(app)
      .post('/register')
      .set('x-internal-token', internalSecret)
      .send({ name: 'Logout User', email, password: 'Password@123' });

    const loginRes = await request(app)
      .post('/login')
      .set('x-internal-token', internalSecret)
      .send({ email, password: 'Password@123' });

    const cookie = loginRes.headers['set-cookie'][0].split(';')[0];

    const logoutRes = await request(app)
      .post('/logout')
      .set('x-internal-token', internalSecret)
      .set('Cookie', [cookie]);

    expect(logoutRes.status).toBe(200);

    // Verify session revoked in real MongoDB
    const user = await User.findOne({ email });
    expect(user.refreshTokens.length).toBe(0);
  }));

  it('Requirement 9: Invalid tokens are rejected', runIfMongo(async () => {
    const res = await request(app)
      .get('/me')
      .set('x-internal-token', internalSecret)
      .set('Authorization', 'Bearer invalid.token.payload');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  }));
});
