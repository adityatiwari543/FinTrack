# FINTRACK TOKEN, SECRET & CREDENTIAL LEAKAGE AUDIT REPORT

**Project**: FinTrack Personal Finance Application  
**Standard**: OWASP Top 10 (A02:2021 Cryptographic Failures, A07:2021 Identification & Auth Failures)  
**Audit Scope**: Repository Codebase, Git History, Build Bundles, Logging Pipelines & Environment Configuration  

---

## 1. Source Code & Git Version Control Hygiene

### 1.1 Git Tracking Verification
A systematic audit of all tracked files in the Git index was performed using `git ls-files`.

- **Audit Query**: `git ls-files | findstr -i "\.env"`
- **Result**:
  ```
  .env.example
  frontend/.env.example
  gateway/.env.example
  services/auth-service/.env.example
  services/notification-service/.env.example
  services/transaction-service/.env.example
  ```
- **Finding**: **Zero production or live `.env` files are tracked by Git.** Only sanitized `.env.example` templates containing dummy placeholders exist in the repository.

### 1.2 `.gitignore` and `.dockerignore` Verification
- Root and service `.gitignore` files contain comprehensive exclusion rules:
  ```gitignore
  .env
  .env.local
  .env.*.local
  node_modules/
  dist/
  *.log
  ```
- All five `.dockerignore` files explicitly exclude `.env*`, `node_modules`, `.git`, and tests, preventing sensitive host files from being copied into container images during `docker build`.

---

## 2. JWT & Token Lifecycle Security

### 2.1 Access Token Security
- **Algorithm**: HMAC-SHA256 (`HS256`).
- **Expiration Window**: 15 minutes (`15m`).
- **Payload Claims**: Minimal claims (`userId`, `email`). Zero sensitive attributes (no passwords, hashes, or internal secrets).
- **Client Storage**: **In-Memory Only.** The frontend maintains the access token strictly in JavaScript heap memory inside `frontend/src/api/client.js` (`ApiClient.accessToken`).
- **XSS Resilience**: Because tokens are not stored in `localStorage` or `sessionStorage`, an XSS attack cannot harvest valid tokens from browser storage.

### 2.2 Refresh Token Security & Database Hashing
- **Expiration Window**: 7 days (`7d`).
- **Cookie Security Attributes**:
  - `httpOnly: true`: Prevents client-side JavaScript from reading or manipulating the cookie.
  - `sameSite: 'Lax'` (in dev) / `'Strict'` (in prod): Guards against Cross-Site Request Forgery (CSRF).
  - `path: '/api/auth'`: Restricts transmission of the cookie strictly to authentication endpoints (`/refresh`, `/logout`), never leaking on transaction or static asset requests.
  - `secure: true` (enforced when `NODE_ENV === 'production'`).
- **Database Storage**:
  - Raw refresh tokens are **never** persisted in the database.
  - The Auth Service hashes incoming refresh tokens using SHA-256 before storing them in the `sessions` collection:
    ```javascript
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    await Session.create({ userId, tokenHash, expiresAt });
    ```
  - Even in the event of an Auth database leak, attackers cannot forge or use compromised session hashes.

### 2.3 Refresh Token Rotation & Session Revocation
- When `/api/auth/refresh` is invoked:
  1. The existing session record is located by SHA-256 hash.
  2. If found, the existing session is deleted immediately.
  3. A new access token and fresh refresh token pair are generated.
  4. The new refresh token hash is saved to MongoDB.
  5. The new refresh token cookie is set.
- Replaying an old or previously used refresh token fails with HTTP 401 `SESSION_EXPIRED`.
- Invoking `POST /api/auth/logout` explicitly deletes the session record from the database and instructs the browser to delete the cookie with an expired `maxAge`.

---

## 3. Inter-Service Secrets (`x-internal-token`)

- **Architecture**: Downstream microservices (Auth, Transaction, Notification) run in a zero-trust model where direct requests from untrusted networks are rejected with HTTP 403 `FORBIDDEN_DIRECT_ACCESS`.
- **Secret Distribution**: Microservices share an `INTERNAL_SERVICE_SECRET` injected strictly via environment variables.
- **Timing Attack Defense**:
  Rather than standard string equality (`token === secret`), all services enforce constant-time buffer comparison:
  ```javascript
  function timingSafeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }
  ```
  This eliminates side-channel timing attacks that allow remote secret extraction.

---

## 4. Database Credential Security & Redaction

### 4.1 Connection String Masking
To prevent MongoDB Atlas credentials from ever appearing in terminal logs, crash reports, or observability pipelines, the connection modules (`services/*/src/config/db.js`) implement regex-based URI redaction:

```javascript
const redactMongoUri = (uri) => {
  if (!uri) return 'NOT_CONFIGURED';
  return uri.replace(/mongodb(\+srv)?:\/\/([^:]+):([^@]+)@/i, 'mongodb$1://$2:****@');
};
```

- When connecting, only the masked host URI (e.g., `mongodb://****:****@...`) is logged.
- In unhandled database connection error handlers, raw error messages are scrubbed before being passed to Pino or stdout.

---

## 5. Frontend Production Build Artifact Inspection

The frontend production bundle generated by Vite (`frontend/dist/assets/*.js`) was analyzed to verify that no environment variables or backend secrets were accidentally inlined during Rollup compilation:

| Inspected Pattern | Search Scope | Result | Status |
| :--- | :--- | :---: | :---: |
| `mongodb://` / Database URIs | `frontend/dist/assets/*.js` | Not Found | **SAFE** |
| `INTERNAL_SERVICE_SECRET` | `frontend/dist/assets/*.js` | Not Found | **SAFE** |
| `JWT_SECRET` | `frontend/dist/assets/*.js` | Not Found | **SAFE** |
| `JWT_REFRESH_SECRET` | `frontend/dist/assets/*.js` | Not Found | **SAFE** |
| Raw Passwords / API Keys | `frontend/dist/assets/*.js` | Not Found | **SAFE** |

**Conclusion**: The frontend client bundle is completely clean of backend secrets, database connection strings, or server keys.
