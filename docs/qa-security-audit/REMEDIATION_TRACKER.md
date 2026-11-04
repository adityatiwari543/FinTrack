# FINTRACK DEFECT & REMEDIATION TRACKER

**Project**: FinTrack Microservices Personal Finance Tracker  
**Policy**: Strict Defect Remediation & Verification Gating  
**Audit Period**: Full Development Lifecycle through Master Security Audit  

---

## 1. Master Remediation Matrix

| Defect ID | Severity | Affected Unit | Root Cause Summary | Remediation Applied | Verification Test | Status |
| :---: | :---: | :--- | :--- | :--- | :--- | :---: |
| **DEF-01** | **P0** | API Gateway | `ReferenceError: target is not defined` inside proxy error event handler crashed Gateway on downstream connection drop. | Replaced undeclared identifier with `downstreamTarget = getTarget()`, wrapped in `try/catch`, returned JSON 502 with `code: 'BAD_GATEWAY'`. | `gateway.test.js` & connection drop simulation | **VERIFIED & CLOSED** |
| **DEF-02** | **P0** | All Backend Units | Subservices defaulted to `127.0.0.1:27017` and failed to load root `.env` or Atlas URIs when run from service subdirectories. | Implemented multi-path `.env` resolution, hierarchical URI fallback (`AUTH_MONGO_URI`, etc.), and `{ dbName: config.dbName }`. | `scripts/test-db-connections.js` | **VERIFIED & CLOSED** |
| **DEF-03** | **P0** | Auth Service | Root `.env` defines `PORT=8000`. Running Auth Service from root inherited `process.env.PORT=8000`, causing `EADDRINUSE`. | Updated `env.js` across all services to prioritize `AUTH_PORT`, `TRANSACTION_PORT`, `NOTIFICATION_PORT`, ignoring `PORT` if equal to 8000. | Service port startup verification | **VERIFIED & CLOSED** |
| **DEF-04** | **P0** | Transaction & Notification | Gateway stripped `/transactions` prefix when proxying, delivering `POST /` to Transaction Service which only routed `/transactions`. | Added route aliases `['/', '/transactions']` and `['/summary', '/transactions/summary']` in route files. | `scripts/seed-demo-data.js` & proxy tests | **VERIFIED & CLOSED** |
| **DEF-05** | **P0** | Transaction Service | Floating-point rupee numbers stored in MongoDB caused IEEE 754 calculation drift in balances and summaries. | Migrated to canonical integer paise (`amountPaise`, `thresholdPaise`), BigInt arithmetic, and created `scripts/migrate-to-paise.js`. | `tests/monetary-precision.test.js` (38 tests) | **VERIFIED & CLOSED** |
| **DEF-06** | **P0** | All Microservices | Direct HTTP requests to microservice ports (5001-5003) bypassed Gateway authentication. | Created `verifyInternalToken` middleware across all services, requiring verified `x-internal-token`. Direct calls rejected with 403. | `security-audit-suite.js` (Category 2) | **VERIFIED & CLOSED** |
| **DEF-07** | **P1** | Microservices Internal Auth | Standard string comparison (`token === secret`) susceptible to side-channel timing attacks. | Enforced constant-time buffer comparison via `crypto.timingSafeEqual(bufA, bufB)` with length pre-check. | `security-audit-suite.js` Scenario 2.3 | **VERIFIED & CLOSED** |
| **DEF-08** | **P0** | Frontend & Auth | Risk of token theft if access or refresh tokens are persisted in browser `localStorage` or `sessionStorage`. | Implemented memory-only access token (`ApiClient.accessToken`) and `httpOnly`, `SameSite=Lax`, `Path=/api/auth` refresh cookie. | `frontend/tests/auth-security.test.cjs` | **VERIFIED & CLOSED** |
| **DEF-09** | **P1** | Notification Consumer | Poison pill or malformed AMQP messages could cause infinite consumer crash loops. | Implemented three-tier error pipeline: malformed JSON routes to DLQ immediately; transient errors retry 3x; duplicate delivery acknowledged idempotently. | `rabbitmq-live-integration.test.js` | **VERIFIED & CLOSED** |
| **DEF-10** | **P1** | Database Logging | MongoDB Atlas connection URIs containing username:password risked exposure in application logs and stack traces. | Added regex-based URI masking in `db.js` (`mongodb$1://$2:****@`) and scrubbed error messages before passing to logger. | Manual inspection & log review | **VERIFIED & CLOSED** |
| **DEF-11** | **P1** | Dockerfiles | Default container processes ran as `root` (UID 0), presenting container breakout risks. | Configured `USER node` in all backend Dockerfiles and `nginx-unprivileged:alpine` for the frontend. | `security-audit-suite.js` Scenario 5.3 | **VERIFIED & CLOSED** |
| **DEF-12** | **P1** | Demo Data Seeder | Demo seeder lacked `x-internal-token`, receiving 403 when creating transactions during initial setup. | Added `x-internal-token` header and synchronized secret across root `.env` and seeder script. | `scripts/seed-demo-data.js` | **VERIFIED & CLOSED** |

---

## 2. Summary of Remediation Status

- **Total Defects Identified & Tracked**: 12
- **P0 Critical Defects**: 6 (100% Remediated & Verified)
- **P1 High Defects**: 6 (100% Remediated & Verified)
- **P2 Minor Defects**: 0 Open
- **Active / Unresolved Defects**: **0**

**Conclusion**: All functional defects, security vulnerabilities, and architectural blockers have been resolved and verified with dedicated test suites.
