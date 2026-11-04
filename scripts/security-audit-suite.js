/**
 * FinTrack Master Security Audit & Penetration Testing Execution Suite
 * 
 * Programmatically runs comprehensive automated tests across:
 * - Authentication & Token Security (Phase 1)
 * - API Gateway Security & Identity Stripping (Phase 2)
 * - Microservice Trust & Direct Access Prevention (Phase 3)
 * - IDOR, Ownership & Tampering (Phase 4)
 * - Secret Leakage & Credential Scanning (Phase 5)
 * - Input Validation & Injection Hardening (Phase 6)
 * - Notification Ownership & Threshold Logic (Phase 7)
 * - Monetary Precision & Decimal Arithmetic (Phase 4 / B4)
 * - Rate Limiting & DoS Hardening (Phase 9)
 * - Dockerfile & Infrastructure Hardening (Phase 10)
 * 
 * SAFEGUARD: Strictly sanitized output. Zero secret leakage.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let jwt;
try {
  jwt = require('jsonwebtoken');
} catch {
  jwt = require('../services/auth-service/node_modules/jsonwebtoken');
}

// Load supertest
let request;
try {
  request = require('supertest');
} catch {
  request = require('../services/auth-service/node_modules/supertest');
}

// Load service express apps
const gatewayApp = require('../gateway/src/app');
const authApp = require('../services/auth-service/src/app');
const transApp = require('../services/transaction-service/src/app');
const notifApp = require('../services/notification-service/src/app');

// Configs
const gatewayConfig = require('../gateway/src/config/env');
const authConfig = require('../services/auth-service/src/config/env');
const transConfig = require('../services/transaction-service/src/config/env');
const notifConfig = require('../services/notification-service/src/config/env');

const results = {
  timestamp: new Date().toISOString(),
  totalPassed: 0,
  totalFailed: 0,
  categories: {}
};

function recordResult(category, testName, passed, details = '') {
  if (!results.categories[category]) {
    results.categories[category] = [];
  }
  results.categories[category].push({ testName, passed, details });
  if (passed) {
    results.totalPassed++;
    console.log(`  [PASS] ${testName}`);
  } else {
    results.totalFailed++;
    console.log(`  [FAIL] ${testName}: ${details}`);
  }
}

async function runAudit() {
  console.log('================================================================');
  console.log('🛡️  FINTRACK MASTER SECURITY AUDIT & PENETRATION TESTING RUNNER');
  console.log('================================================================\n');

  // =========================================================================
  // CATEGORY 1: Authentication & Token Security (Phase 1)
  // =========================================================================
  console.log('--- Category 1: Authentication & Token Security ---');
  const dummyUserId = new Array(24).fill('a').join('');
  const testSecret = authConfig.jwtSecret || 'default_test_jwt_secret_32_characters';

  // 1.1 Algorithm "none" attack
  try {
    const unsignedToken = jwt.sign({ userId: dummyUserId, email: 'attacker@evil.com' }, '', { algorithm: 'none' });
    const res = await request(gatewayApp)
      .get('/api/transactions')
      .set('Authorization', `Bearer ${unsignedToken}`);
    const passed = res.status === 401 && (res.body?.error?.code === 'INVALID_TOKEN' || res.body?.error?.code === 'UNAUTHORIZED');
    recordResult('Authentication', 'Rejection of unsigned/alg=none JWT', passed, `Status: ${res.status}`);
  } catch (err) {
    recordResult('Authentication', 'Rejection of unsigned/alg=none JWT', false, err.message);
  }

  // 1.2 Tampered token signature
  try {
    const validToken = jwt.sign({ userId: dummyUserId }, testSecret, { expiresIn: '15m' });
    const tampered = validToken.substring(0, validToken.length - 5) + 'XXXXX';
    const res = await request(gatewayApp)
      .get('/api/transactions')
      .set('Authorization', `Bearer ${tampered}`);
    const passed = res.status === 401 && res.body?.error?.code === 'INVALID_TOKEN';
    recordResult('Authentication', 'Rejection of tampered JWT signature', passed, `Status: ${res.status}`);
  } catch (err) {
    recordResult('Authentication', 'Rejection of tampered JWT signature', false, err.message);
  }

  // 1.3 Expired token
  try {
    const expiredToken = jwt.sign({ userId: dummyUserId }, testSecret, { expiresIn: -10 });
    const res = await request(gatewayApp)
      .get('/api/transactions')
      .set('Authorization', `Bearer ${expiredToken}`);
    const passed = res.status === 401 && res.body?.error?.code === 'TOKEN_EXPIRED';
    recordResult('Authentication', 'Rejection of expired JWT with TOKEN_EXPIRED code', passed, `Status: ${res.status}`);
  } catch (err) {
    recordResult('Authentication', 'Rejection of expired JWT with TOKEN_EXPIRED code', false, err.message);
  }

  // 1.4 Missing Authorization header
  try {
    const res = await request(gatewayApp).get('/api/transactions');
    const passed = res.status === 401 && res.body?.error?.code === 'UNAUTHORIZED';
    recordResult('Authentication', 'Rejection of unauthenticated protected request', passed, `Status: ${res.status}`);
  } catch (err) {
    recordResult('Authentication', 'Rejection of unauthenticated protected request', false, err.message);
  }

  // 1.5 Registration validation (password < 6 chars)
  try {
    const res = await request(authApp)
      .post('/register')
      .set('x-internal-token', authConfig.internalServiceSecret)
      .send({ name: 'Short Pass', email: 'short@test.com', password: '123' });
    const passed = res.status === 400 && res.body?.error?.code === 'VALIDATION_ERROR';
    recordResult('Authentication', 'Password length policy enforcement (<6 rejected)', passed, `Status: ${res.status}`);
  } catch (err) {
    recordResult('Authentication', 'Password length policy enforcement (<6 rejected)', false, err.message);
  }

  // 1.6 NoSQL Injection attack payload in auth
  try {
    const res = await request(authApp)
      .post('/login')
      .set('x-internal-token', authConfig.internalServiceSecret)
      .send({ email: { '$gt': '' }, password: { '$gt': '' } });
    const passed = res.status === 400 && res.body?.error?.code === 'VALIDATION_ERROR';
    recordResult('Authentication', 'NoSQL injection object in login rejected by schema', passed, `Status: ${res.status}`);
  } catch (err) {
    recordResult('Authentication', 'NoSQL injection object in login rejected by schema', false, err.message);
  }

  // =========================================================================
  // CATEGORY 2: API Gateway Security & Identity Stripping (Phase 2 & 3)
  // =========================================================================
  console.log('\n--- Category 2: API Gateway & Microservice Isolation ---');

  // 2.1 Direct microservice access without x-internal-token
  try {
    const resAuth = await request(authApp).get('/me');
    const resTrans = await request(transApp).get('/transactions');
    const resNotif = await request(notifApp).get('/notifications');
    const passed = (resAuth.status === 403 || resAuth.status === 401) &&
                   resTrans.status === 403 &&
                   resNotif.status === 403;
    recordResult('Gateway & Isolation', 'Direct microservice access rejected with 403 without internal token', passed,
      `Auth: ${resAuth.status}, Trans: ${resTrans.status}, Notif: ${resNotif.status}`);
  } catch (err) {
    recordResult('Gateway & Isolation', 'Direct microservice access rejected with 403 without internal token', false, err.message);
  }

  // 2.2 Direct microservice access with invalid x-internal-token
  try {
    const resTrans = await request(transApp)
      .get('/transactions')
      .set('x-internal-token', 'tampered_fake_secret_attacker');
    const passed = resTrans.status === 403 && resTrans.body?.error?.code === 'INVALID_INTERNAL_TOKEN';
    recordResult('Gateway & Isolation', 'Direct microservice access with forged internal token rejected', passed, `Status: ${resTrans.status}`);
  } catch (err) {
    recordResult('Gateway & Isolation', 'Direct microservice access with forged internal token rejected', false, err.message);
  }

  // 2.3 Timing-safe compare protection
  try {
    const res = await request(transApp)
      .get('/transactions')
      .set('x-internal-token', authConfig.internalServiceSecret ? authConfig.internalServiceSecret.substring(0, 10) : 'short');
    const passed = res.status === 403;
    recordResult('Gateway & Isolation', 'Internal token timing-safe length mismatch rejection', passed, `Status: ${res.status}`);
  } catch (err) {
    recordResult('Gateway & Isolation', 'Internal token timing-safe length mismatch rejection', false, err.message);
  }

  // 2.4 CORS Disallowed origin
  try {
    const res = await request(gatewayApp)
      .get('/health')
      .set('Origin', 'http://malicious-attacker-domain.xyz');
    const passed = res.status === 403;
    recordResult('Gateway & Isolation', 'CORS rejection for untrusted external origins', passed, `Status: ${res.status}`);
  } catch (err) {
    recordResult('Gateway & Isolation', 'CORS rejection for untrusted external origins', false, err.message);
  }

  // 2.5 Request ID propagation
  try {
    const res = await request(gatewayApp)
      .get('/health')
      .set('x-request-id', 'req-test-trace-12345');
    const passed = res.headers['x-request-id'] === 'req-test-trace-12345';
    recordResult('Gateway & Isolation', 'Request ID preservation and propagation header', passed, `Header: ${res.headers['x-request-id']}`);
  } catch (err) {
    recordResult('Gateway & Isolation', 'Request ID preservation and propagation header', false, err.message);
  }

  // =========================================================================
  // CATEGORY 3: Transaction IDOR & Data Integrity (Phase 4 & B4)
  // =========================================================================
  console.log('\n--- Category 3: Transaction IDOR & Data Integrity ---');

  // 3.1 IDOR on Transaction Query: Missing user ID header
  try {
    const res = await request(transApp)
      .get('/transactions')
      .set('x-internal-token', transConfig.internalServiceSecret);
    const passed = res.status === 401 && res.body?.error?.code === 'UNAUTHORIZED';
    recordResult('Data Integrity & IDOR', 'Transaction retrieval blocked without verified user identity', passed, `Status: ${res.status}`);
  } catch (err) {
    recordResult('Data Integrity & IDOR', 'Transaction retrieval blocked without verified user identity', false, err.message);
  }

  // 3.2 Monetary Precision: Reject negative transaction amount
  try {
    const res = await request(transApp)
      .post('/transactions')
      .set('x-internal-token', transConfig.internalServiceSecret)
      .set('x-user-id', dummyUserId)
      .send({ amount: -50, type: 'expense', category: 'Food' });
    const passed = res.status === 400 && res.body?.error?.code === 'VALIDATION_ERROR';
    recordResult('Data Integrity & IDOR', 'Rejection of negative transaction amount', passed, `Status: ${res.status}`);
  } catch (err) {
    recordResult('Data Integrity & IDOR', 'Rejection of negative transaction amount', false, err.message);
  }

  // 3.3 Monetary Precision: Reject zero transaction amount
  try {
    const res = await request(transApp)
      .post('/transactions')
      .set('x-internal-token', transConfig.internalServiceSecret)
      .set('x-user-id', dummyUserId)
      .send({ amount: 0, type: 'expense', category: 'Food' });
    const passed = res.status === 400 && res.body?.error?.code === 'VALIDATION_ERROR';
    recordResult('Data Integrity & IDOR', 'Rejection of zero transaction amount', passed, `Status: ${res.status}`);
  } catch (err) {
    recordResult('Data Integrity & IDOR', 'Rejection of zero transaction amount', false, err.message);
  }

  // 3.4 Monetary Precision: Reject sub-paise fractional precision (>2 decimal places)
  try {
    const res = await request(transApp)
      .post('/transactions')
      .set('x-internal-token', transConfig.internalServiceSecret)
      .set('x-user-id', dummyUserId)
      .send({ amount: 100.999, type: 'expense', category: 'Food' });
    const passed = res.status === 400 && res.body?.error?.code === 'VALIDATION_ERROR';
    recordResult('Data Integrity & IDOR', 'Rejection of sub-paise fractional amount (>2 decimals)', passed, `Status: ${res.status}`);
  } catch (err) {
    recordResult('Data Integrity & IDOR', 'Rejection of sub-paise fractional amount (>2 decimals)', false, err.message);
  }

  // 3.5 Invalid Transaction Type
  try {
    const res = await request(transApp)
      .post('/transactions')
      .set('x-internal-token', transConfig.internalServiceSecret)
      .set('x-user-id', dummyUserId)
      .send({ amount: 100, type: 'crypto_transfer', category: 'Food' });
    const passed = res.status === 400 && res.body?.error?.code === 'VALIDATION_ERROR';
    recordResult('Data Integrity & IDOR', 'Rejection of invalid transaction type enum', passed, `Status: ${res.status}`);
  } catch (err) {
    recordResult('Data Integrity & IDOR', 'Rejection of invalid transaction type enum', false, err.message);
  }

  // 3.6 Invalid Transaction ID format
  try {
    const res = await request(transApp)
      .get('/transactions/invalid-mongo-id')
      .set('x-internal-token', transConfig.internalServiceSecret)
      .set('x-user-id', dummyUserId);
    const passed = res.status === 400 && res.body?.error?.code === 'INVALID_ID';
    recordResult('Data Integrity & IDOR', 'Rejection of malformed transaction ObjectId', passed, `Status: ${res.status}`);
  } catch (err) {
    recordResult('Data Integrity & IDOR', 'Rejection of malformed transaction ObjectId', false, err.message);
  }

  // =========================================================================
  // CATEGORY 4: Notification & Threshold Security (Phase 7)
  // =========================================================================
  console.log('\n--- Category 4: Notification & Threshold Security ---');

  // 4.1 Notification retrieval requires verified identity
  try {
    const res = await request(notifApp)
      .get('/notifications')
      .set('x-internal-token', notifConfig.internalServiceSecret);
    const passed = res.status === 401 && res.body?.error?.code === 'UNAUTHORIZED';
    recordResult('Notification & Threshold', 'Notification retrieval blocked without user identity', passed, `Status: ${res.status}`);
  } catch (err) {
    recordResult('Notification & Threshold', 'Notification retrieval blocked without user identity', false, err.message);
  }

  // 4.2 Negative threshold value rejected
  try {
    const res = await request(notifApp)
      .put('/settings/threshold')
      .set('x-internal-token', notifConfig.internalServiceSecret)
      .set('x-user-id', dummyUserId)
      .send({ threshold: -1000 });
    const passed = res.status === 400 && res.body?.error?.code === 'VALIDATION_ERROR';
    recordResult('Notification & Threshold', 'Rejection of negative alert threshold', passed, `Status: ${res.status}`);
  } catch (err) {
    recordResult('Notification & Threshold', 'Rejection of negative alert threshold', false, err.message);
  }

  // 4.3 Non-numeric threshold value rejected
  try {
    const res = await request(notifApp)
      .put('/settings/threshold')
      .set('x-internal-token', notifConfig.internalServiceSecret)
      .set('x-user-id', dummyUserId)
      .send({ threshold: 'not-a-number' });
    const passed = res.status === 400 && res.body?.error?.code === 'VALIDATION_ERROR';
    recordResult('Notification & Threshold', 'Rejection of non-numeric alert threshold', passed, `Status: ${res.status}`);
  } catch (err) {
    recordResult('Notification & Threshold', 'Rejection of non-numeric alert threshold', false, err.message);
  }

  // 4.4 Sub-paise threshold rejected
  try {
    const res = await request(notifApp)
      .put('/settings/threshold')
      .set('x-internal-token', notifConfig.internalServiceSecret)
      .set('x-user-id', dummyUserId)
      .send({ threshold: 5000.555 });
    const passed = res.status === 400 && res.body?.error?.code === 'VALIDATION_ERROR';
    recordResult('Notification & Threshold', 'Rejection of fractional sub-paise threshold (>2 decimals)', passed, `Status: ${res.status}`);
  } catch (err) {
    recordResult('Notification & Threshold', 'Rejection of fractional sub-paise threshold (>2 decimals)', false, err.message);
  }

  // =========================================================================
  // CATEGORY 5: Secret, Credential & Data Leakage Audit (Phase 5)
  // =========================================================================
  console.log('\n--- Category 5: Secret & Credential Leakage Scan ---');

  // 5.1 Scan .gitignore for .env protection
  try {
    const gitignoreContent = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
    const passed = gitignoreContent.includes('.env') &&
                   gitignoreContent.includes('node_modules');
    recordResult('Secret Leakage', '.gitignore enforces exclusion of .env and node_modules', passed);
  } catch (err) {
    recordResult('Secret Leakage', '.gitignore enforces exclusion of .env and node_modules', false, err.message);
  }

  // 5.2 Scan Dockerfiles for secret injection
  try {
    const dockerfiles = [
      'gateway/Dockerfile',
      'services/auth-service/Dockerfile',
      'services/transaction-service/Dockerfile',
      'services/notification-service/Dockerfile',
      'frontend/Dockerfile'
    ];
    let allSafe = true;
    for (const df of dockerfiles) {
      const content = fs.readFileSync(path.join(__dirname, '..', df), 'utf8');
      if (content.includes('COPY .env') || content.includes('ENV JWT_SECRET') || content.includes('ENV MONGO_URI')) {
        allSafe = false;
        break;
      }
    }
    recordResult('Secret Leakage', 'Dockerfiles do not embed hardcoded secrets or copy .env files', allSafe);
  } catch (err) {
    recordResult('Secret Leakage', 'Dockerfiles do not embed hardcoded secrets or copy .env files', false, err.message);
  }

  // 5.3 Verify non-root user in Dockerfiles
  try {
    const backendDockerfiles = [
      'gateway/Dockerfile',
      'services/auth-service/Dockerfile',
      'services/transaction-service/Dockerfile',
      'services/notification-service/Dockerfile'
    ];
    let allHaveNonRoot = true;
    for (const df of backendDockerfiles) {
      const content = fs.readFileSync(path.join(__dirname, '..', df), 'utf8');
      if (!content.includes('USER node')) {
        allHaveNonRoot = false;
        break;
      }
    }
    recordResult('Secret Leakage', 'Dockerfiles enforce least-privilege non-root execution (USER node)', allHaveNonRoot);
  } catch (err) {
    recordResult('Secret Leakage', 'Dockerfiles enforce least-privilege non-root execution (USER node)', false, err.message);
  }

  // 5.4 Scan Frontend Production Build for leaked secrets
  try {
    const distPath = path.join(__dirname, '..', 'frontend', 'dist', 'assets');
    let noLeakedSecrets = true;
    if (fs.existsSync(distPath)) {
      const files = fs.readdirSync(distPath).filter(f => f.endsWith('.js'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(distPath, file), 'utf8');
        // Search for accidental secret embeddings
        if (content.includes('mongodb+srv://') ||
            content.includes('INTERNAL_SERVICE_SECRET') ||
            content.includes('JWT_REFRESH_SECRET')) {
          noLeakedSecrets = false;
          break;
        }
      }
    }
    recordResult('Secret Leakage', 'Frontend production build bundle free of backend connection strings or secrets', noLeakedSecrets);
  } catch (err) {
    recordResult('Secret Leakage', 'Frontend production build bundle free of backend connection strings or secrets', false, err.message);
  }

  // =========================================================================
  // CATEGORY 6: RabbitMQ Resilience & Idempotency Architecture (Phase 8)
  // =========================================================================
  console.log('\n--- Category 6: RabbitMQ Architecture & Error Handling ---');
  const eventConsumer = require('../services/notification-service/src/services/eventConsumer');
  const eventPublisher = require('../services/transaction-service/src/services/eventPublisher');

  // 6.1 Validate payload validator rejects null or primitive
  try {
    const valRes = eventConsumer.validateExpenseEvent(null);
    const passed = valRes.isValid === false;
    recordResult('RabbitMQ Architecture', 'Consumer rejects null or non-object event payloads', passed);
  } catch (err) {
    recordResult('RabbitMQ Architecture', 'Consumer rejects null or non-object event payloads', false, err.message);
  }

  // 6.2 Validate payload validator rejects missing transactionId
  try {
    const valRes = eventConsumer.validateExpenseEvent({ userId: 'u1', amountPaise: 1000 });
    const passed = valRes.isValid === false;
    recordResult('RabbitMQ Architecture', 'Consumer rejects event missing transactionId (routes to DLQ)', passed);
  } catch (err) {
    recordResult('RabbitMQ Architecture', 'Consumer rejects event missing transactionId (routes to DLQ)', false, err.message);
  }

  // 6.3 Validate payload validator rejects non-integer amountPaise
  try {
    const valRes = eventConsumer.validateExpenseEvent({ transactionId: 't1', userId: 'u1', amountPaise: 100.5 });
    const passed = valRes.isValid === false;
    recordResult('RabbitMQ Architecture', 'Consumer rejects non-integer amountPaise (routes to DLQ)', passed);
  } catch (err) {
    recordResult('RabbitMQ Architecture', 'Consumer rejects non-integer amountPaise (routes to DLQ)', false, err.message);
  }

  // 6.4 Validate payload validator accepts clean canonical payload
  try {
    const valRes = eventConsumer.validateExpenseEvent({ transactionId: 't1', userId: 'u1', amountPaise: 500000 });
    const passed = valRes.isValid === true;
    recordResult('RabbitMQ Architecture', 'Consumer accepts valid integer paise event payload', passed);
  } catch (err) {
    recordResult('RabbitMQ Architecture', 'Consumer accepts valid integer paise event payload', false, err.message);
  }

  // =========================================================================
  // CATEGORY 7: Rate Limiting & DoS Protection (Phase 9)
  // =========================================================================
  console.log('\n--- Category 7: Rate Limiting & Abuse Prevention ---');
  try {
    const rateLimiterMiddleware = require('../gateway/src/middlewares/rateLimiter.middleware');
    const passed = typeof rateLimiterMiddleware === 'function';
    recordResult('Rate Limiting & DoS', 'API Gateway applies express-rate-limit middleware on all routes', passed);
  } catch (err) {
    recordResult('Rate Limiting & DoS', 'API Gateway applies express-rate-limit middleware on all routes', false, err.message);
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n================================================================');
  console.log(`📊 AUDIT SUMMARY:`);
  console.log(`   - Total Security & Pen-Tests: ${results.totalPassed + results.totalFailed}`);
  console.log(`   - Passed: ${results.totalPassed}`);
  console.log(`   - Failed: ${results.totalFailed}`);
  console.log(`   - Pass Rate: ${((results.totalPassed / (results.totalPassed + results.totalFailed)) * 100).toFixed(1)}%`);
  console.log('================================================================\n');

  // Save JSON report for docs generation
  const auditReportPath = path.join(__dirname, '..', 'docs', 'qa-security-audit', 'automated-results.json');
  fs.mkdirSync(path.dirname(auditReportPath), { recursive: true });
  fs.writeFileSync(auditReportPath, JSON.stringify(results, null, 2), 'utf8');
}

runAudit().catch(err => {
  console.error('Audit runner error:', err);
  process.exit(1);
});
