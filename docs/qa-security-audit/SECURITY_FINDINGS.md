# FINTRACK SECURITY FINDINGS & VULNERABILITY ANALYSIS REPORT

**Project**: FinTrack Personal Finance Application  
**Standard**: OWASP Top 10 (2021), CWE/SANS Top 25, STRIDE Threat Model, CVSS v3.1  
**Audit Scope**: Complete Monorepo Codebase & Microservices Mesh  

---

## 1. Vulnerability Summary Table

| ID | Title | Component | STRIDE | CWE | CVSS v3.1 | Status |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: |
| **SEC-01** | Gateway Crash on Downstream Interruption | API Gateway | Denial of Service | CWE-754 | **7.5 (High)** | **REMEDIATED** |
| **SEC-02** | Microservice Direct Access Port Bypass | Microservices | Elevation of Privilege | CWE-306 | **8.6 (High)** | **REMEDIATED** |
| **SEC-03** | Client Header Identity Spoofing | API Gateway | Spoofing | CWE-290 | **8.8 (High)** | **REMEDIATED** |
| **SEC-04** | JWT Algorithm Confusion & Unsigned Tokens | API Gateway / Auth | Spoofing | CWE-345 | **8.1 (High)** | **REMEDIATED** |
| **SEC-05** | Timing Attack on Internal Secret Validation | All Microservices | Information Disclosure | CWE-208 | **5.3 (Medium)** | **REMEDIATED** |
| **SEC-06** | Insecure Token Storage in Browser Storage | Frontend / Auth | Information Disclosure | CWE-922 | **7.4 (High)** | **REMEDIATED** |
| **SEC-07** | Floating-Point Financial Calculation Drift | Transaction Service | Tampering | CWE-682 | **5.5 (Medium)** | **REMEDIATED** |
| **SEC-08** | Insecure CORS Origin Wildcard Reflection | API Gateway | Information Disclosure | CWE-942 | **6.5 (Medium)** | **REMEDIATED** |
| **SEC-09** | RabbitMQ Poison Pill Consumer Crash Loop | Notification Service | Denial of Service | CWE-400 | **6.8 (Medium)** | **REMEDIATED** |
| **SEC-10** | Container Root Execution Privilege | Docker Containers | Elevation of Privilege | CWE-250 | **6.2 (Medium)** | **REMEDIATED** |

---

## 2. In-Depth Vulnerability Details & Remediations

### SEC-01: API Gateway Crash on Downstream Connection Interruption
- **Component**: `gateway/src/routes/proxy.routes.js:43`
- **Vulnerability**: In the proxy error event handler, an undeclared identifier `target` triggered an unhandled `ReferenceError: target is not defined`, crashing the API Gateway Node.js process whenever a downstream service dropped connection.
- **STRIDE**: Denial of Service (DoS)
- **CVSS v3.1 Vector**: `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H` (**Score: 7.5 High**)
- **Remediation**:
  Replaced undeclared variable with `downstreamTarget = getTarget()`, wrapped the entire handler in a protective `try/catch` block, logged a structured error via Pino with `requestId`, and returned a graceful HTTP 502 (`BAD_GATEWAY`) JSON payload to the client.
- **Verification**: Verified via `gateway.test.js` and automated proxy error injection. Process remains healthy.

---

### SEC-02: Microservice Direct Access Port Bypass
- **Component**: `services/auth-service`, `services/transaction-service`, `services/notification-service`
- **Vulnerability**: If container host ports 5001, 5002, or 5003 are exposed or reachable within the Docker network, an attacker could directly invoke backend endpoints without passing through API Gateway authentication or rate limiting.
- **STRIDE**: Elevation of Privilege
- **CVSS v3.1 Vector**: `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N` (**Score: 8.6 High**)
- **Remediation**:
  Implemented mandatory `verifyInternalToken` middleware across all backend service routes. Downstream services require a shared `x-internal-token` header that is only injected by the API Gateway. Direct requests missing or having an invalid token receive HTTP 403 `FORBIDDEN_DIRECT_ACCESS`.
- **Verification**: Automated pen-test scenario 2.1 & 2.2 confirmed all microservices return HTTP 403 for direct requests.

---

### SEC-03: Client Header Identity Spoofing (`x-user-id`, `x-internal-token`)
- **Component**: `gateway/src/app.js` and `gateway/src/routes/proxy.routes.js`
- **Vulnerability**: If an attacker crafts HTTP requests containing headers `x-user-id: <victim_id>` or `x-internal-token: <secret>`, poorly configured proxies might forward those client headers downstream, allowing account takeover.
- **STRIDE**: Spoofing
- **CVSS v3.1 Vector**: `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N` (**Score: 8.8 High**)
- **Remediation**:
  Applied two-tier stripping:
  1. Gateway global middleware explicitly executes `delete req.headers['x-user-id']`, `delete req.headers['x-user-email']`, and `delete req.headers['x-internal-token']`.
  2. Proxy middleware executes `proxyReq.removeHeader(...)` before injecting verified JWT claims and server secrets.
- **Verification**: Verified via `gateway.integration.test.js` Requirement 6 & 7. Client spoofed headers are stripped and overwritten.

---

### SEC-04: JWT Algorithm Confusion & Unsigned Tokens (`alg: none`)
- **Component**: `gateway/src/middlewares/auth.middleware.js`
- **Vulnerability**: Attackers might attempt to forge JWT tokens using `{"alg": "none"}` or by tampering with the signature to impersonate arbitrary users.
- **STRIDE**: Spoofing
- **CVSS v3.1 Vector**: `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N` (**Score: 8.1 High**)
- **Remediation**:
  `jwt.verify(token, config.jwtSecret)` strictly enforces cryptographic signature validation using HMAC-SHA256. Unsigned tokens and algorithm `none` tokens are immediately rejected with HTTP 401 `INVALID_TOKEN`.
- **Verification**: Verified by automated pen-test Category 1 (Scenarios 1.1 and 1.2). Returns 401.

---

### SEC-05: Timing Attack on Internal Secret Validation
- **Component**: `services/*/src/middlewares/internalAuth.middleware.js`
- **Vulnerability**: Using standard JavaScript string comparison (`token === secret`) leaks character-by-character timing differences that allow an attacker to reconstruct the internal secret byte by byte.
- **STRIDE**: Information Disclosure
- **CVSS v3.1 Vector**: `CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N` (**Score: 5.3 Medium**)
- **Remediation**:
  Implemented constant-time comparison using Node.js `crypto.timingSafeEqual(bufA, bufB)` with strict buffer length checks.
- **Verification**: Automated pen-test Scenario 2.3 verified buffer length mismatch and invalid tokens are rejected safely.

---

### SEC-06: Insecure Token Storage in Browser Storage
- **Component**: `frontend/src/api/client.js`, `frontend/src/context/AuthContext.jsx`
- **Vulnerability**: Storing access tokens or refresh tokens in `localStorage` or `sessionStorage` exposes credentials to Cross-Site Scripting (XSS) extraction.
- **STRIDE**: Information Disclosure
- **CVSS v3.1 Vector**: `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N` (**Score: 7.4 High**)
- **Remediation**:
  - Access tokens are stored exclusively in in-memory JavaScript variable (`ApiClient.accessToken`).
  - Refresh tokens are transmitted via `httpOnly`, `SameSite=Lax`, `Path=/api/auth` secure cookies and hashed using SHA-256 before database storage.
  - Zero authentication tokens reside in `localStorage` or `sessionStorage`.
- **Verification**: Verified via `frontend/tests/auth-security.test.cjs` and Phase D frontend audit.

---

### SEC-07: Floating-Point Financial Calculation Drift
- **Component**: `services/transaction-service`, `services/notification-service`
- **Vulnerability**: JavaScript `Number` represents values using IEEE 754 64-bit floating point, leading to rounding drift (e.g., `0.1 + 0.2 === 0.30000000000000004`). In financial ledgers, this causes cumulative discrepancies.
- **STRIDE**: Tampering / Data Integrity
- **CVSS v3.1 Vector**: `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N` (**Score: 5.5 Medium**)
- **Remediation**:
  Migrated schema and logic to canonical integer paise (`amountPaise`, `thresholdPaise`). Financial sums, balance, savings rate, and threshold comparisons execute using integer arithmetic.
- **Verification**: Verified via `tests/monetary-precision.test.js` (38 tests) and automated migration verification script.

---

### SEC-08: Insecure CORS Origin Wildcard Reflection
- **Component**: `gateway/src/app.js`
- **Vulnerability**: Setting `Access-Control-Allow-Origin: *` or reflecting arbitrary `Origin` headers while `credentials: true` enables malicious third-party websites to execute authenticated requests using victim cookies.
- **STRIDE**: Information Disclosure
- **CVSS v3.1 Vector**: `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:N/A:N` (**Score: 6.5 Medium**)
- **Remediation**:
  Gateway enforces strict origin whitelisting via `config.allowedOrigins` (`http://localhost:5173`, `http://localhost:3000`, etc.). Untrusted origins receive HTTP 403 `CORS_ORIGIN_DENIED`. Additionally, CSRF checks validate `Origin` header on `/refresh` and `/logout`.
- **Verification**: Automated pen-test Scenario 2.4 confirmed untrusted origin `http://malicious-attacker-domain.xyz` is rejected with 403.

---

### SEC-09: RabbitMQ Poison Pill Consumer Crash Loop
- **Component**: `services/notification-service/src/services/eventConsumer.js`
- **Vulnerability**: A malformed event or unhandled parsing exception on an AMQP channel causes the consumer to crash or reject without ack, re-queuing the poison message infinitely and starving the queue.
- **STRIDE**: Denial of Service
- **CVSS v3.1 Vector**: `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H` (**Score: 6.8 Medium**)
- **Remediation**:
  - Pre-parse schema validation isolates malformed JSON and schema mismatches.
  - Poison pills are forwarded immediately to Dead-Letter Queue (`notifications_expense_dlq`) with `x-rejection-reason` and acknowledged from the main queue.
  - Transient errors retry up to 3 times via a delayed retry queue before DLQ routing.
- **Verification**: Verified via `rabbitmq-live-integration.test.js` and automated pen-test Category 6.

---

### SEC-10: Container Root Execution Privilege
- **Component**: Dockerfiles across all services
- **Vulnerability**: Running Node.js application processes as `root` (UID 0) in containers allows container escape vulnerabilities to compromise the host kernel.
- **STRIDE**: Elevation of Privilege
- **CVSS v3.1 Vector**: `CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H` (**Score: 6.2 Medium**)
- **Remediation**:
  Configured `USER node` in all service Dockerfiles and non-root unprivileged execution in `frontend/Dockerfile` (`nginxinc/nginx-unprivileged:alpine`).
- **Verification**: Automated pen-test Scenario 5.3 verified `USER node` is enforced across all backend Dockerfiles.
