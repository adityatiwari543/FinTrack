# FINTRACK API ENDPOINT SECURITY TESTING & PENETRATION REPORT

**Target**: API Gateway (Port 8000) & Internal Microservices Mesh (Ports 5001, 5002, 5003)  
**Standard**: OWASP API Security Top 10 (2023)  
**Test Harness**: Supertest, Jest, and Automated Custom Security Runner  

---

## 1. Authentication Service Endpoints (`/api/auth/*`)

### 1.1 `POST /api/auth/register`
- **Purpose**: Creates a new user account.
- **Security Controls**:
  - Request body validated via Zod schema (`registerSchema`).
  - Email format strictly validated and lowercased.
  - Password minimum length enforced (>= 6 characters).
  - Password hashed using bcrypt (salt rounds: 10).
  - Unique index on `email` prevents duplicate registration race conditions.
  - Generates short-lived Access Token (15m) and secure Refresh Token (7d).
  - Sets `httpOnly`, `SameSite=Lax`, `Path=/api/auth` cookie.
- **Pen-Testing Scenarios & Results**:
  | Test Case | Payload / Condition | Expected Result | Actual Result | Status |
  | :--- | :--- | :---: | :---: | :---: |
  | Password < 6 chars | `{"name":"A","email":"a@b.com","password":"123"}` | 400 Bad Request | 400 `VALIDATION_ERROR` | **PASS** |
  | Invalid email | `{"name":"A","email":"not-an-email","password":"password123"}` | 400 Bad Request | 400 `VALIDATION_ERROR` | **PASS** |
  | Duplicate email | Existing registered email | 409 Conflict | 409 `EMAIL_EXISTS` | **PASS** |
  | Refresh token in JSON | Inspect response body | Not present | Refresh token omitted from JSON | **PASS** |
  | Valid Registration | Clean payload | 201 Created | 201 Created + Cookie set | **PASS** |

### 1.2 `POST /api/auth/login`
- **Purpose**: Authenticates user credentials.
- **Security Controls**:
  - Validates email and password types via Zod.
  - Constant-time password verification via `bcrypt.compare`.
  - Non-existent email returns generic 401 message (prevents user enumeration).
  - Creates new session record in Auth DB with SHA-256 hashed refresh token.
- **Pen-Testing Scenarios & Results**:
  | Test Case | Payload / Condition | Expected Result | Actual Result | Status |
  | :--- | :--- | :---: | :---: | :---: |
  | Wrong password | Valid email, wrong password | 401 Unauthorized | 401 `INVALID_CREDENTIALS` | **PASS** |
  | Non-existent user | Unregistered email | 401 Unauthorized | 401 `INVALID_CREDENTIALS` | **PASS** |
  | NoSQL Injection | `{"email":{"$gt":""},"password":{"$gt":""}}` | 400 Bad Request | 400 `VALIDATION_ERROR` | **PASS** |
  | Successful Login | Valid credentials | 200 OK | 200 OK + access token + cookie | **PASS** |

### 1.3 `POST /api/auth/refresh`
- **Purpose**: Rotates access and refresh tokens without user re-authentication.
- **Security Controls**:
  - Reads refresh token from `httpOnly` cookie (or optional body for mobile clients).
  - Cryptographically verifies token using `JWT_REFRESH_SECRET`.
  - Searches database for hashed token match.
  - Rotates refresh token: old token deleted, new token generated and saved.
  - Replay attack defense: old token immediately becomes invalid.
- **Pen-Testing Scenarios & Results**:
  | Test Case | Payload / Condition | Expected Result | Actual Result | Status |
  | :--- | :--- | :---: | :---: | :---: |
  | Missing refresh token | No cookie or body | 401 Unauthorized | 401 `UNAUTHORIZED` | **PASS** |
  | Invalid/Tampered token | Corrupted signature | 401 Unauthorized | 401 `INVALID_TOKEN` | **PASS** |
  | Reused refresh token | Replaying previously rotated token | 401 Unauthorized | 401 `SESSION_EXPIRED` | **PASS** |
  | Valid rotation | Valid cookie | 200 OK | 200 OK + new token & cookie | **PASS** |

### 1.4 `POST /api/auth/logout`
- **Purpose**: Terminates user session.
- **Security Controls**:
  - Revokes session record from database.
  - Clears `httpOnly` refresh cookie with past expiration date.
- **Pen-Testing Scenarios & Results**:
  | Test Case | Payload / Condition | Expected Result | Actual Result | Status |
  | :--- | :--- | :---: | :---: | :---: |
  | Normal logout | Valid session | 200 OK | 200 OK, session revoked, cookie cleared | **PASS** |
  | Token reuse post logout | Attempt refresh with logged out cookie | 401 Unauthorized | 401 `SESSION_EXPIRED` | **PASS** |

### 1.5 `GET /api/auth/me`
- **Purpose**: Retrieves authenticated user profile.
- **Security Controls**:
  - Requires `Authorization: Bearer <accessToken>`.
  - Validates token signature and expiration.
  - Downstream call protected by `verifyInternalToken`.
- **Pen-Testing Scenarios & Results**:
  | Test Case | Payload / Condition | Expected Result | Actual Result | Status |
  | :--- | :--- | :---: | :---: | :---: |
  | Missing token | No Authorization header | 401 Unauthorized | 401 `UNAUTHORIZED` | **PASS** |
  | Expired token | Token with past `exp` claim | 401 Unauthorized | 401 `TOKEN_EXPIRED` | **PASS** |
  | Valid token | Valid JWT | 200 OK | 200 OK + user object | **PASS** |

---

## 2. Transaction Service Endpoints (`/api/transactions/*`)

### 2.1 `POST /api/transactions`
- **Purpose**: Creates an income or expense transaction.
- **Security Controls**:
  - Enforces `verifyGatewayToken` at API Gateway.
  - Enforces `verifyInternalToken` and `requireUser` at Transaction Service.
  - Input amount validated: positive number, max 2 decimal places.
  - Amount stored as integer paise (`amountPaise = Math.round(amount * 100)`).
  - Emits async event to RabbitMQ for type `expense`.
- **Pen-Testing Scenarios & Results**:
  | Test Case | Payload / Condition | Expected Result | Actual Result | Status |
  | :--- | :--- | :---: | :---: | :---: |
  | Negative amount | `{"amount": -50, "type": "expense"}` | 400 Bad Request | 400 `VALIDATION_ERROR` | **PASS** |
  | Zero amount | `{"amount": 0, "type": "expense"}` | 400 Bad Request | 400 `VALIDATION_ERROR` | **PASS** |
  | Sub-paise precision | `{"amount": 100.999, "type": "expense"}` | 400 Bad Request | 400 `VALIDATION_ERROR` | **PASS** |
  | Invalid type | `{"amount": 500, "type": "transfer"}` | 400 Bad Request | 400 `VALIDATION_ERROR` | **PASS** |
  | Client-injected userId | `{"userId": "victim_id", "amount": 100, ...}` | Overwritten by JWT userId | Record saved under JWT userId | **PASS** |

### 2.2 `GET /api/transactions`
- **Purpose**: Lists paginated transactions with optional filters.
- **Security Controls**:
  - Scoped strictly by `userId` from gateway header.
  - Month filter validated against `YYYY-MM` regex.
  - Pagination limits clamped (default: 10, page >= 1).
- **Pen-Testing Scenarios & Results**:
  | Test Case | Payload / Condition | Expected Result | Actual Result | Status |
  | :--- | :--- | :---: | :---: | :---: |
  | Cross-user isolation | User A requests transaction list | Returns only User A data | 0 User B records returned | **PASS** |
  | Invalid month format | `?month=invalid-date` | 400 Bad Request | 400 `VALIDATION_ERROR` | **PASS** |
  | Valid pagination | `?page=1&limit=5` | 200 OK + metadata | 200 OK `{ total, page, limit, totalPages }` | **PASS** |

### 2.3 `GET /api/transactions/:id` (IDOR Testing)
- **Purpose**: Retrieves a single transaction.
- **Security Controls**:
  - Validates MongoDB ObjectId format.
  - Queries `{ _id: id, userId }`.
- **Pen-Testing Scenarios & Results**:
  | Test Case | Payload / Condition | Expected Result | Actual Result | Status |
  | :--- | :--- | :---: | :---: | :---: |
  | Malformed ID | `GET /api/transactions/not-an-id` | 400 Bad Request | 400 `INVALID_ID` | **PASS** |
  | IDOR Attack (User A accesses User B record) | Valid ID belonging to User B | 404 Not Found | 404 `NOT_FOUND` | **PASS** |
  | Legitimate Access | Valid ID belonging to User A | 200 OK | 200 OK + transaction data | **PASS** |

### 2.4 `PUT /api/transactions/:id` & `DELETE /api/transactions/:id`
- **Purpose**: Modifies or removes a transaction.
- **Security Controls**:
  - Queries `{ _id: id, userId }` for ownership verification.
  - Amount updates enforce integer paise conversion.
- **Pen-Testing Scenarios & Results**:
  | Test Case | Payload / Condition | Expected Result | Actual Result | Status |
  | :--- | :--- | :---: | :---: | :---: |
  | IDOR Update Attempt | User A attempts update on User B's record | 404 Not Found | 404 `NOT_FOUND` (no write) | **PASS** |
  | IDOR Delete Attempt | User A attempts delete on User B's record | 404 Not Found | 404 `NOT_FOUND` (no delete) | **PASS** |
  | Authorized Update | User A updates own record | 200 OK | 200 OK + updated transaction | **PASS** |
  | Authorized Delete | User A deletes own record | 200 OK | 200 OK + deleted confirmation | **PASS** |

### 2.5 `GET /api/transactions/summary`
- **Purpose**: Computes monthly income, expense, balance, and category breakdown.
- **Security Controls**:
  - Scoped to `userId` at stage 1 of MongoDB aggregation pipeline.
  - Sums executed in integer paise; formatted to INR.
- **Pen-Testing Scenarios & Results**:
  | Test Case | Payload / Condition | Expected Result | Actual Result | Status |
  | :--- | :--- | :---: | :---: | :---: |
  | Aggregation Leakage | Verify if another user's totals mix into sum | Strictly user-scoped | Only authenticated user data included | **PASS** |
  | Balance Precision | Check `balance = income - expense` | Exact to paise | Exact integer arithmetic verified | **PASS** |

---

## 3. Notification Service Endpoints (`/api/notifications/*` & `/api/settings/*`)

### 3.1 `GET /api/notifications` & `PATCH /api/notifications/:id/read`
- **Purpose**: Lists notifications and updates read status.
- **Security Controls**:
  - Scoped strictly to `userId`.
  - IDOR protected via `{ _id: id, userId }`.
- **Pen-Testing Scenarios & Results**:
  | Test Case | Payload / Condition | Expected Result | Actual Result | Status |
  | :--- | :--- | :---: | :---: | :---: |
  | Notification list isolation | User A fetches notifications | Only User A notifications | 0 User B notifications returned | **PASS** |
  | IDOR Mark Read | User A marks User B's notification read | 404 Not Found | 404 `NOT_FOUND` | **PASS** |

### 3.2 `GET /api/settings/threshold` & `PUT /api/settings/threshold`
- **Purpose**: Manages monthly expense alert threshold.
- **Security Controls**:
  - Scoped to `userId`.
  - Non-negative number validated, max 2 decimals.
  - Converted to integer `thresholdPaise`.
- **Pen-Testing Scenarios & Results**:
  | Test Case | Payload / Condition | Expected Result | Actual Result | Status |
  | :--- | :--- | :---: | :---: | :---: |
  | Negative threshold | `{"threshold": -100}` | 400 Bad Request | 400 `VALIDATION_ERROR` | **PASS** |
  | Non-numeric threshold | `{"threshold": "high"}` | 400 Bad Request | 400 `VALIDATION_ERROR` | **PASS** |
  | Sub-paise precision | `{"threshold": 5000.555}` | 400 Bad Request | 400 `VALIDATION_ERROR` | **PASS** |
  | Valid update | `{"threshold": 15000}` | 200 OK | 200 OK + threshold INR | **PASS** |

---

## 4. API Security Testing Conclusion

Every API endpoint across the 4 backend units was subjected to negative testing, malformed input testing, injection attempts, and IDOR attacks. All endpoints enforced proper authentication, authorization, schema validation, and tenant isolation without any data leakage or privilege escalation.
