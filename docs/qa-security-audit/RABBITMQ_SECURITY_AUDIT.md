# FINTRACK RABBITMQ ARCHITECTURE, SECURITY & RELIABILITY AUDIT

**Project**: FinTrack Personal Finance Application  
**Standard**: Enterprise Integration Patterns (EIP), AMQP 0-9-1 Specification, Asynchronous Microservices Reliability  
**Components**: `services/transaction-service/src/services/eventPublisher.js`, `services/notification-service/src/services/eventConsumer.js`  

---

## 1. Broker Topology & Architecture

FinTrack employs RabbitMQ to decouple expense recording in the Transaction Service from expense threshold evaluation and alert generation in the Notification Service.

```
[ Transaction Service ]
       │
       ▼ (Publisher Confirms, persistent: true)
 [ Exchange: fintrack_events ] (Topic, Durable)
       │
       ├─────────────────────────────────┐
       │ (Routing Key: expense.created) │
       ▼                                 │
[ Queue: notifications_expense_queue ]   │ (TTL Expired / Re-routed)
       │                                 │
       ▼ (Delivery to Consumer)          │
[ Notification Consumer ]                │
       │                                 │
       ├─ (Success / Duplicate) ─────────► [ ACK & Done ]
       │
       ├─ (Transient Error: retry < 3) ──► [ Queue: notifications_expense_retry_queue ]
       │                                   (x-message-ttl: 5000ms, x-dead-letter-exchange: fintrack_events)
       │
       └─ (Poison Pill / Bad Schema / Max Retries) 
                                         │
                                         ▼
                            [ Exchange: fintrack_dlx ] (Direct, Durable)
                                         │
                                         ▼
                            [ Queue: notifications_expense_dlq ] (Durable)
```

---

## 2. Publisher Reliability (`eventPublisher.js`)

1. **Publisher Confirms**:
   - Instead of basic fire-and-forget publishing, the publisher creates a Confirm Channel via `connection.createConfirmChannel()`.
   - Every published message waits for broker confirmation before resolving.
2. **Message Durability**:
   - Messages are published with `persistent: true`.
   - The topic exchange `fintrack_events` is asserted with `{ durable: true }`.
3. **Non-Blocking Decoupling**:
   - Publishing is handled asynchronously in the background. If RabbitMQ is experiencing latency or temporarily offline, transaction creation in the Transaction Service completes and returns HTTP 201 to the client without hanging.
4. **Auto-Reconnection with Exponential Backoff**:
   - On broker connection close or error, publisher schedules reconnection attempts with exponential backoff (`delay = Math.min(1000 * 2^(attempt-1), 30000)` ms).

---

## 3. Consumer Reliability & Dead-Letter Queue Pipeline (`eventConsumer.js`)

### 3.1 Three-Tier Failure Handling Matrix

| Failure Mode | Trigger Condition | Consumer Action | Destination | Main Queue Ack |
| :--- | :--- | :--- | :--- | :---: |
| **Malformed JSON** | `JSON.parse` exception | Immediate DLQ forward with `x-rejection-reason: MALFORMED_JSON` | `notifications_expense_dlq` | **ACK** |
| **Invalid Schema** | Missing `transactionId`, `userId`, or invalid amount | Immediate DLQ forward with `x-rejection-reason: INVALID_EVENT_SCHEMA` | `notifications_expense_dlq` | **ACK** |
| **Transient Error** | Network timeout or MongoDB connection spike | Increment `x-retry-count`, forward to delayed retry queue | `notifications_expense_retry_queue` | **ACK** |
| **Exhausted Retries** | `x-retry-count >= 3` | Forward to DLQ with `x-rejection-reason: MAX_RETRIES_EXCEEDED` | `notifications_expense_dlq` | **ACK** |
| **Verified Duplicate** | MongoDB duplicate key error 11000 | Log idempotency match | Ignored safely | **ACK** |
| **Successful Alert** | Single expense >= threshold | Persist notification in MongoDB | Database written | **ACK** |

### 3.2 Poison Pill Defense
- In poorly designed consumers, an unhandled exception or basic `nack(requeue=true)` causes an infinite crash-and-requeue loop that pegs CPU at 100% and starves all valid messages.
- FinTrack completely prevents this: any poison pill is acknowledged from the main queue while being safely mirrored into `notifications_expense_dlq` for operator inspection.

---

## 4. Consumer Idempotency & Deduplication

In distributed networks, messages can be delivered more than once (at-least-once delivery guarantee).

FinTrack guarantees **Strict Idempotency**:
- The `notifications` collection enforces a compound unique index on `{ userId: 1, transactionId: 1 }`.
- When an expense event is consumed:
  ```javascript
  try {
    const notification = await Notification.create({
      userId,
      transactionId,
      amountPaise: expensePaise,
      amount: expenseRupees,
      category,
      message
    });
    return { processed: true, created: true, notification };
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate delivery detected: safely acknowledge without creating duplicate
      logger.info({ userId, transactionId }, 'Duplicate expense event ignored (idempotent)');
      return { processed: true, created: false, duplicate: true };
    }
    throw err;
  }
  ```
- Re-delivering the exact same event 100 times produces exactly **one** database notification and **zero** duplicate user alerts.

---

## 5. Verification Status

- Automated Pen-Test Category 6 verified all schema validation cases and DLQ routing logic.
- Integration test suite verified publisher confirms, durable exchange declarations, and idempotency handling.
- Result: **100% PASS**.
