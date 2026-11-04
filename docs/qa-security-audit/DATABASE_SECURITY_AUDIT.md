# FINTRACK DATABASE SECURITY, ISOLATION & DATA INTEGRITY AUDIT

**Project**: FinTrack Personal Finance Application  
**Standard**: Microservices Database-Per-Service Pattern, ACID Guarantees, Financial Precision Standards  
**Databases Audited**: `fintrack_auth`, `fintrack_transactions`, `fintrack_notifications`  

---

## 1. Database-Per-Service Isolation

FinTrack strictly implements the **Database-Per-Service** pattern. Each microservice possesses exclusive ownership of its data store. Direct cross-database access is prohibited by design.

```
┌─────────────────────────┐   ┌───────────────────────────────┐   ┌───────────────────────────────┐
│      Auth Service       │   │      Transaction Service      │   │     Notification Service      │
└────────────┬────────────┘   └───────────────┬───────────────┘   └───────────────┬───────────────┘
             │                                │                                   │
             ▼                                ▼                                   ▼
┌─────────────────────────┐   ┌───────────────────────────────┐   ┌───────────────────────────────┐
│ Database: fintrack_auth │   │Database: fintrack_transactions│   │Database: fintrack_notification│
│ - users                 │   │ - transactions                │   │ - notifications               │
│ - sessions              │   │                               │   │ - thresholds                  │
└─────────────────────────┘   └───────────────────────────────┘   └───────────────────────────────┘
```

### Empirical Database Verification (MongoDB Atlas)
A dedicated multi-database connection test (`scripts/test-db-connections.js`) was executed against the configured MongoDB Atlas cluster:

| Database Identifier | Configured DB Name | Live Connected DB | Collections Verified | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Auth Database** | `fintrack_auth` | `fintrack_auth` | `users`, `sessions` | **CONNECTED & ISOLATED** |
| **Transaction Database** | `fintrack_transactions` | `fintrack_transactions` | `transactions` | **CONNECTED & ISOLATED** |
| **Notification Database** | `fintrack_notifications` | `fintrack_notifications` | `notifications`, `thresholds` | **CONNECTED & ISOLATED** |

- **Findings**:
  - Connection pooling enforces `{ dbName: config.dbName }`.
  - Transaction Service code contains zero references to `User` or `Notification` models.
  - Notification Service code contains zero references to `User` or `Transaction` models.
  - Auth Service code contains zero references to `Transaction` or `Notification` models.

---

## 2. Indexing Strategy & Query Optimization

Indexes were verified across all three databases to ensure query efficiency, prevent full-collection table scans, and enforce uniqueness constraints.

### 2.1 `fintrack_auth`
| Collection | Indexed Fields | Type | Purpose |
| :--- | :--- | :---: | :--- |
| `users` | `{ email: 1 }` | **Unique** | Enforces email uniqueness; speeds up login lookups |
| `sessions` | `{ tokenHash: 1 }` | Index | Speeds up refresh token lookup during session rotation |
| `sessions` | `{ expiresAt: 1 }` | TTL / Index | Enables automatic cleanup of expired refresh tokens |

### 2.2 `fintrack_transactions`
| Collection | Indexed Fields | Type | Purpose |
| :--- | :--- | :---: | :--- |
| `transactions` | `{ userId: 1, date: -1 }` | Compound | Fast retrieval of user transactions sorted by date |
| `transactions` | `{ userId: 1, type: 1 }` | Compound | Speeds up income/expense filtered queries & aggregations |
| `transactions` | `{ _id: 1, userId: 1 }` | Compound | Guarantees instant IDOR ownership verification on CRUD |

### 2.3 `fintrack_notifications`
| Collection | Indexed Fields | Type | Purpose |
| :--- | :--- | :---: | :--- |
| `notifications` | `{ userId: 1, transactionId: 1 }` | **Unique** | **Critical**: Guarantees idempotent event consumption; prevents duplicate alerts |
| `notifications` | `{ userId: 1, createdAt: -1 }` | Compound | Speeds up unread badge counts and notification listing |
| `thresholds` | `{ userId: 1 }` | **Unique** | Guarantees single threshold setting record per user |

---

## 3. Financial Data Integrity & Integer Paise Engine

### 3.1 Floating-Point Elimination
JavaScript floating-point arithmetic (IEEE 754) introduces fractional errors when performing decimal addition and subtraction. In financial systems, this creates balance reconciliation discrepancies.

FinTrack enforces **Canonical Integer Paise**:
- All financial inputs in INR (e.g. ₹150.75) are converted to integer paise (`15075`) at the validation/service boundary.
- **Conversion Formula**: `amountPaise = Math.round(Number(amountRupees) * 100)`.
- **Database Storage**:
  - `amountPaise`: Int32 / Int64 integer representation.
  - `amount`: Maintained for backward compatibility and human readability.
- **Aggregation Pipelines**:
  Monthly summary totals, net balance, and category-wise totals are summed directly in integer paise:
  ```javascript
  {
    $group: {
      _id: '$type',
      totalPaise: { $sum: '$amountPaise' }
    }
  }
  ```
- **Rounding Policy**:
  - Exact round-half-up policy on 2-decimal inputs.
  - Floating values with >2 decimal places (e.g. `10.999`) are rejected by Zod validation with HTTP 400 `VALIDATION_ERROR`.

### 3.2 Migration Script Idempotency (`scripts/migrate-to-paise.js`)
- An automated migration tool exists to migrate legacy float rupee records to integer paise.
- **Idempotency Guarantee**: The migration query matches only documents where `amountPaise: { $exists: false }` or `thresholdPaise: { $exists: false }`. Running the migration repeatedly produces zero changes and zero double-conversions.
- Verified in `services/transaction-service/tests/migration.test.js`.

---

## 4. NoSQL Injection & Query Hardening

- All user-supplied query parameters (`month`, `type`, `category`, `page`, `limit`) and request bodies are parsed through strict Zod schemas before being passed to Mongoose queries.
- Raw MongoDB operator injections (e.g. `{"$gt": ""}`, `{"$where": "..."}`, `{"$ne": null}`) are rejected as invalid types during schema parsing.
- String inputs used in regular expressions (e.g. category search) are escaped to prevent catastrophic regex backtracking (ReDoS).
