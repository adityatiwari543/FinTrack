# FinTrack — Production Deployment Guide & Architecture Specification

This document provides the complete production deployment specification, infrastructure topology, security configuration, and operational procedures for FinTrack.

---

## 1. Production Architecture Overview

FinTrack is architected to deploy as five decoupled services across private and public networking tiers:

```mermaid
flowchart TD
    subgraph PublicInternet ["Public Internet (HTTPS / TLS 1.3)"]
        UserBrowser["User Browser / Client"]
    end

    subgraph EdgeTier ["Public Ingress Tier"]
        FrontendCDN["Frontend Static Hosting (CDN)\nDomain: https://fintrack.app\n• Nginx / CloudFront / S3"]
        APIGateway["API Gateway Container\nDomain: https://api.fintrack.app\n• Rate Limiting • JWT Auth\n• Request ID Injection\nPort: 443 -> 8000"]
    end

    subgraph PrivateVPC ["Private Virtual Private Cloud (VPC / Subnet)"]
        subgraph Microservices ["Internal Backend Services (No Public IPs)"]
            AuthSvc["Auth Service\nhttp://auth-service.internal:5001\n• Bcrypt • JWT Rotation"]
            TxSvc["Transaction Service\nhttp://transaction-service.internal:5002\n• CRUD • Event Publisher"]
            NotifSvc["Notification Service\nhttp://notification-service.internal:5003\n• RabbitMQ Consumer • Thresholds"]
        end

        subgraph ManagedBroker ["Managed Message Broker"]
            RabbitMQ["CloudAMQP / Amazon MQ\n• Encrypted AMQPS (Port 5671)\n• Durable Quorum Queues\n• Dead-Letter Exchange (DLX)"]
        end

        subgraph ManagedDatastores ["Managed Databases (MongoDB Atlas)"]
            AuthDB[("MongoDB: fintrack_auth\nPort: 27017")]
            TxDB[("MongoDB: fintrack_transactions\nPort: 27017")]
            NotifDB[("MongoDB: fintrack_notifications\nPort: 27017")]
        end
    end

    UserBrowser -->|HTTPS :443| FrontendCDN
    UserBrowser -->|HTTPS :443| APIGateway

    APIGateway -->|Internal HTTP + x-internal-token| AuthSvc
    APIGateway -->|Internal HTTP + x-internal-token + x-user-id| TxSvc
    APIGateway -->|Internal HTTP + x-internal-token + x-user-id| NotifSvc

    AuthSvc -->|TLS Connection String| AuthDB
    TxSvc -->|TLS Connection String| TxDB
    NotifSvc -->|TLS Connection String| NotifDB

    TxSvc -.->|"AMQPS Publish (expense.created)"| RabbitMQ
    RabbitMQ -.->|"AMQPS Consume & Ack"| NotifSvc
```

---

## 2. Network Tiering & Security Boundaries

### 2.1 Public Tier (Ingress)
- **Frontend**: Serves static HTML/JS/CSS assets compiled with Vite. Only port 443 (HTTPS) is accessible.
- **API Gateway**: The sole public entry point for API traffic. All incoming requests are rate-limited, validated, and sanitized (client-supplied identity headers stripped).
- **SSL/TLS**: Terminated at the load balancer or edge CDN using TLS 1.3 / TLS 1.2 with automated Let's Encrypt or AWS Certificate Manager (ACM) certificates.

### 2.2 Private Tier (Microservices & Databases)
- **Zero Host Exposure**: Backend microservices, MongoDB instances, and RabbitMQ have no public IP addresses and no public DNS records.
- **Gateway-to-Service Defense**: Downstream services reject any request lacking a valid `x-internal-token` header (`INTERNAL_SERVICE_SECRET`) with HTTP 403 Forbidden using constant-time string comparison (`crypto.timingSafeEqual`).
- **Database Isolation**: Even inside the private network, each service connects only to its dedicated database credentials and database name (`fintrack_auth`, `fintrack_transactions`, `fintrack_notifications`). Direct cross-service database access is prohibited.

---

## 3. Required Hosting Resources & Compute Sizing

| Component | Target Platform | Recommended Sizing | High Availability |
| :--- | :--- | :--- | :--- |
| **Frontend** | CloudFront + S3, Cloudflare Pages, or Render Static | Static Asset CDN | Multi-region edge distribution |
| **API Gateway** | AWS ECS Fargate, GCP Cloud Run, or Render Web Service | 0.5 vCPU, 512 MB RAM | Minimum 2 replicas behind ALB |
| **Auth Service** | AWS ECS Fargate, GCP Cloud Run, or Render Private Service | 0.5 vCPU, 512 MB RAM | Minimum 2 replicas |
| **Transaction Service** | AWS ECS Fargate, GCP Cloud Run, or Render Private Service | 0.5 vCPU, 512 MB RAM | Minimum 2 replicas |
| **Notification Service** | AWS ECS Fargate, GCP Cloud Run, or Render Private Service | 0.5 vCPU, 512 MB RAM | Minimum 2 replicas (worker pool) |
| **Message Broker** | CloudAMQP (Dedicated or shared tier) or Amazon MQ | 1 vCPU, 1 GB RAM | Clustered broker with disk persistence |
| **MongoDB** | MongoDB Atlas (Shared M0/M10 or Serverless) | Dedicated tier | Replica Set (Primary + 2 Secondaries) |

---

## 4. Production Environment Variables Reference

### 4.1 Global & Shared Variables
| Variable Name | Required | Description | Example / Format |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | Sets runtime optimization mode | `production` |
| `INTERNAL_SERVICE_SECRET` | Yes | Shared secret for Gateway-to-Service authentication | 64-character hex string (`openssl rand -hex 32`) |

### 4.2 API Gateway
| Variable Name | Required | Description | Example / Format |
| :--- | :--- | :--- | :--- |
| `PORT` | Yes | Container listen port | `8000` |
| `FRONTEND_URL` | Yes | Primary frontend origin for CORS | `https://fintrack.app` |
| `CORS_ORIGINS` | Yes | Comma-separated allowed CORS origins | `https://fintrack.app,https://app.fintrack.app` |
| `JWT_SECRET` | Yes | Cryptographic key for verifying access tokens | 64-character hex string |
| `AUTH_SERVICE_URL` | Yes | Internal URL of Auth Service | `http://auth-service.internal:5001` |
| `TRANSACTION_SERVICE_URL` | Yes | Internal URL of Transaction Service | `http://transaction-service.internal:5002` |
| `NOTIFICATION_SERVICE_URL` | Yes | Internal URL of Notification Service | `http://notification-service.internal:5003` |
| `RATE_LIMIT_WINDOW_MS` | No | Rate limit window in milliseconds | `900000` (15 minutes) |
| `RATE_LIMIT_MAX` | No | Maximum requests per IP per window | `200` |

### 4.3 Auth Service
| Variable Name | Required | Description | Example / Format |
| :--- | :--- | :--- | :--- |
| `PORT` | Yes | Container listen port | `5001` |
| `MONGO_URI` | Yes | MongoDB connection string | `mongodb://localhost:27017/fintrack_auth` |
| `JWT_SECRET` | Yes | Key for signing short-lived access tokens | 64-character hex string |
| `JWT_EXPIRES_IN` | No | Access token lifespan | `15m` |
| `REFRESH_TOKEN_SECRET` | Yes | Key for signing refresh tokens | 64-character hex string |
| `REFRESH_TOKEN_EXPIRES_IN`| No | Refresh token lifespan | `7d` |
| `COOKIE_SECURE` | Yes | Enforces HTTPS-only cookies | `true` |
| `COOKIE_SAMESITE` | Yes | SameSite policy (`lax`, `strict`, or `none`) | `lax` (or `none` if cross-apex domain) |
| `COOKIE_DOMAIN` | No | Shared parent domain for subdomain auth | `.fintrack.app` |

### 4.4 Transaction Service
| Variable Name | Required | Description | Example / Format |
| :--- | :--- | :--- | :--- |
| `PORT` | Yes | Container listen port | `5002` |
| `MONGO_URI` | Yes | MongoDB connection string | `mongodb://localhost:27017/fintrack_transactions` |
| `RABBITMQ_URL` | Yes | Encrypted broker AMQPS connection string | `amqps://user:pass@broker.cloudamqp.com/vhost` |
| `EXCHANGE_NAME` | No | Topic exchange name | `fintrack_events` |
| `ROUTING_KEY_EXPENSE` | No | Routing key for expense creation | `expense.created` |

### 4.5 Notification Service
| Variable Name | Required | Description | Example / Format |
| :--- | :--- | :--- | :--- |
| `PORT` | Yes | Container listen port | `5003` |
| `MONGO_URI` | Yes | MongoDB connection string | `mongodb://localhost:27017/fintrack_notifications` |
| `RABBITMQ_URL` | Yes | Encrypted broker AMQPS connection string | `amqps://user:pass@broker.cloudamqp.com/vhost` |
| `QUEUE_NAME` | No | Main expense notifications queue | `notifications_expense_queue` |
| `DEFAULT_ALERT_THRESHOLD` | No | Fallback threshold amount in INR | `10000` |
| `MAX_RETRIES` | No | Maximum retry attempts before DLQ | `3` |
| `RETRY_DELAY_MS` | No | TTL delay for retry queue (ms) | `5000` |
| `DLX_NAME` | No | Dead-Letter Exchange | `fintrack_dlx` |
| `DLQ_NAME` | No | Dead-Letter Queue | `notifications_expense_dlq` |
| `RETRY_QUEUE_NAME` | No | Retry queue name | `notifications_expense_retry_queue` |

### 4.6 Frontend
| Variable Name | Required | Description | Example / Format |
| :--- | :--- | :--- | :--- |
| `VITE_API_GATEWAY_URL` | Yes | Public URL of the API Gateway | `https://api.fintrack.app/api` |

---

## 5. Service-by-Service Deployment Order

To guarantee zero downtime and satisfy startup dependencies, services must be provisioned in the following strict order:

```mermaid
flowchart LR
    Step1["1. Databases & Broker\n(MongoDB Atlas & RabbitMQ)"] --> Step2["2. Run Migrations\n(Paise Schema Verification)"]
    Step2 --> Step3["3. Internal Services\n(Auth, Transaction, Notification)"]
    Step3 --> Step4["4. API Gateway\n(Routes to verified internal services)"]
    Step4 --> Step5["5. Frontend UI\n(Built with Gateway URL)"]
```

1. **Step 1: Managed Infrastructure Setup**:
   - Provision MongoDB Atlas cluster; create databases `fintrack_auth`, `fintrack_transactions`, and `fintrack_notifications`.
   - Provision RabbitMQ instance (CloudAMQP or Amazon MQ); verify AMQPS connectivity.
   - Configure private VPC network and VPC peering/PrivateLink if using cloud providers.

2. **Step 2: Database Migration Check**:
   - Run `npm run migrate` or verify that integer paise schema indexes (`{ userId: 1, transactionId: 1 }` in Notification Service) exist.

3. **Step 3: Backend Microservices**:
   - Deploy `auth-service`, `transaction-service`, and `notification-service`.
   - Verify that all three container health checks pass (`GET /health` returns HTTP 200).

4. **Step 4: API Gateway**:
   - Deploy `gateway` with internal URLs pointing to the backend microservices.
   - Verify Gateway health check (`GET https://api.fintrack.app/health`).

5. **Step 5: Frontend Application**:
   - Compile and deploy frontend build with `VITE_API_GATEWAY_URL=https://api.fintrack.app/api`.
   - Verify frontend loads and connects to the Gateway.

---

## 6. DNS, Domain & Cookie Architecture

### 6.1 Recommended Domain Topology
- **Frontend UI**: `https://fintrack.app` (or `https://app.fintrack.app`)
- **API Gateway**: `https://api.fintrack.app`

### 6.2 Cross-Subdomain Cookie Configuration
When frontend and API share a common parent domain (`fintrack.app`), the `httpOnly` refresh token cookie can be securely scoped:

```http
Set-Cookie: refreshToken=eyJhbGciOi...; 
    Domain=.fintrack.app; 
    Path=/api/auth; 
    Secure; 
    HttpOnly; 
    SameSite=Lax; 
    Max-Age=604800
```

- **`Domain=.fintrack.app`**: Allows `https://fintrack.app` and `https://app.fintrack.app` to include the cookie when making requests to `https://api.fintrack.app`.
- **`SameSite=Lax`**: Provides CSRF protection while permitting top-level navigation.
- **`Secure`**: Guarantees transmission strictly over TLS/HTTPS.
- **`HttpOnly`**: Protects the refresh token from JavaScript XSS attacks.

*Note: If the frontend and API Gateway are hosted on separate apex domains (e.g. `fintrack-client.vercel.app` and `fintrack-api.onrender.com`), `SameSite=None; Secure=true` must be configured, and strict `Origin` header validation is enforced by the Gateway.*

---

## 7. Health Checks, Monitoring & Graceful Termination

### 7.1 Container Health Check Specifications
Every container specifies a self-contained health check:

| Service | Health Check Command | Expected Output | Interval |
| :--- | :--- | :--- | :--- |
| **API Gateway** | `node -e "fetch('http://localhost:8000/health').then(r => process.exit(r.ok ? 0 : 1))"` | HTTP 200 `{"status":"ok"}` | 15s |
| **Auth Service** | `node -e "fetch('http://localhost:5001/health').then(r => process.exit(r.ok ? 0 : 1))"` | HTTP 200 `{"status":"ok"}` | 15s |
| **Transaction Service** | `node -e "fetch('http://localhost:5002/health').then(r => process.exit(r.ok ? 0 : 1))"` | HTTP 200 `{"status":"ok"}` | 15s |
| **Notification Service** | `node -e "fetch('http://localhost:5003/health').then(r => process.exit(r.ok ? 0 : 1))"` | HTTP 200 `{"status":"ok"}` | 15s |
| **Frontend Nginx** | `wget -qO- http://localhost:80/health \|\| exit 1` | HTTP 200 `healthy` | 20s |

### 7.2 Graceful Shutdown Procedure
All backend services implement `SIGTERM` and `SIGINT` signal handlers:
1. Stop accepting new inbound HTTP requests.
2. Flush and close active RabbitMQ channels and publisher confirms.
3. Finish processing in-flight consumer messages and acknowledge (`channel.ack`).
4. Close Mongoose database connections.
5. Exit cleanly with code `0`.

---

## 8. Render Production Deployment Guide

This section specifies the operational implementation for deploying FinTrack on Render using the automated `render.yaml` Blueprint or manual service creation.

### 8.1 Render Architecture & Service Types

FinTrack deploys as a multi-tier microservices cluster inside a single Render Workspace/Project in the same region (e.g. `frankfurt` or `singapore`):

| Service Name | Render Service Type | Plan Tier | Runtime | Network Accessibility |
| :--- | :--- | :--- | :--- | :--- |
| **`fintrack-frontend`** | Static Site (`type: web`, `runtime: static`) | Free | Static / CDN | Public Internet (`https://fintrack-frontend.onrender.com`) |
| **`fintrack-gateway`** | Web Service (`type: web`, `runtime: docker`) | Starter (or Free) | Docker | Public Internet (`https://fintrack-gateway.onrender.com`) |
| **`auth-service`** | Private Service (`type: pserv`, `runtime: docker`) | Starter ($7/mo) | Docker | Internal Private Network (`http://auth-service:5001`) |
| **`transaction-service`**| Private Service (`type: pserv`, `runtime: docker`) | Starter ($7/mo) | Docker | Internal Private Network (`http://transaction-service:5002`) |
| **`notification-service`**| Private Service (`type: pserv`, `runtime: docker`)| Starter ($7/mo) | Docker | Internal Private Network (`http://notification-service:5003`) |

> [!IMPORTANT]
> **Render Private Services Pricing Reality**:
> Render Private Services (`type: pserv`) do **not** support the free tier and require a minimum **Starter** plan ($7/month per service). A complete 5-component deployment with 3 private services costs **$21 – $28/month**.

### 8.2 External Managed Infrastructure Setup

#### 1. MongoDB Atlas Setup
1. Log in to [MongoDB Atlas](https://cloud.mongodb.com).
2. Use an existing cluster or create a shared M0 cluster in the same cloud region as your Render services.
3. **Database Segregation**:
   - Create three independent logical databases: `fintrack_auth`, `fintrack_transactions`, and `fintrack_notifications`.
4. **Database Users (Production Scoping)**:
   - For optimal security, create three scoped database users with `readWrite` restricted strictly to their respective databases, or utilize an administrative user with scoped credentials.
5. **Network Access / IP Allowlist**:
   - Because Render dynamic containers do not provide static outbound IPv4 addresses on standard plans, configure Network Access Allowlist to `0.0.0.0/0` (Allow Access from Anywhere).
   - Secure access strictly with SCRAM-SHA-256 authentication and TLS 1.3 encryption.
6. **Connection String Format**:
   ```text
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority
   ```

#### 2. CloudAMQP (RabbitMQ) Setup
1. Sign up or log in to [CloudAMQP](https://customer.cloudamqp.com).
2. Create a new instance on the free **Little Lemur** tier (or dedicated cluster) in the same geographic region (e.g. AWS Frankfurt / Singapore).
3. Copy the encrypted AMQPS URL from the CloudAMQP console:
   ```text
   amqps://<username>:<password>@<host>.rmq.cloudamqp.com/<vhost>
   ```
4. Verify broker access in the CloudAMQP Management interface. FinTrack will automatically assert the durable exchange `fintrack_events`, durable queue `notifications_expense_queue`, retry queue, and dead-letter exchange `fintrack_dlx`.

### 8.3 Render Blueprint Deployment (`render.yaml`)

FinTrack provides a turnkey `render.yaml` Blueprint at the repository root conforming strictly to the [Render Blueprint Schema](https://render.com/schema/render.yaml.json).

#### Step-by-Step Blueprint Launch:
1. Log in to the [Render Dashboard](https://dashboard.render.com).
2. Navigate to **Blueprints** -> Click **New Blueprint Instance**.
3. Connect your GitHub repository: `adityatiwari543/FinTrack`.
4. Render detects `render.yaml` and parses the 5 services automatically.
5. When prompted for variables marked `sync: false`, input your production secrets:
   - `INTERNAL_SERVICE_SECRET`: Generate a secure 64-character hex string (`openssl rand -hex 32`).
   - `JWT_SECRET`: Generate a secure 64-character hex string.
   - `REFRESH_TOKEN_SECRET`: Generate a secure 64-character hex string.
   - `AUTH_MONGO_URI`: Atlas connection string for `fintrack_auth`.
   - `TRANSACTION_MONGO_URI`: Atlas connection string for `fintrack_transactions`.
   - `NOTIFICATION_MONGO_URI`: Atlas connection string for `fintrack_notifications`.
   - `RABBITMQ_URL`: CloudAMQP AMQPS connection string.
6. Click **Apply**. Render provisions all five services according to dependency order.

### 8.4 Manual Dashboard Configuration (If Not Using Blueprint)

If provisioning services individually through the Render GUI:

1. **Provision Private Services First**:
   - `auth-service`: New -> Private Service -> Docker -> Context `services/auth-service`, Dockerfile `services/auth-service/Dockerfile`. Set `PORT: 5001`.
   - `transaction-service`: New -> Private Service -> Docker -> Context `services/transaction-service`, Dockerfile `services/transaction-service/Dockerfile`. Set `PORT: 5002`.
   - `notification-service`: New -> Private Service -> Docker -> Context `services/notification-service`, Dockerfile `services/notification-service/Dockerfile`. Set `PORT: 5003`.
2. **Provision API Gateway**:
   - `fintrack-gateway`: New -> Web Service -> Docker -> Context `gateway`, Dockerfile `gateway/Dockerfile`. Health Check Path: `/health`.
   - Set internal URLs:
     - `AUTH_SERVICE_URL`: `http://auth-service:5001`
     - `TRANSACTION_SERVICE_URL`: `http://transaction-service:5002`
     - `NOTIFICATION_SERVICE_URL`: `http://notification-service:5003`
3. **Provision Frontend**:
   - `fintrack-frontend`: New -> Static Site. Root Directory: `frontend`. Build Command: `npm ci && npm run build`. Publish Directory: `dist` (or `frontend/dist`).
   - Add SPA Rewrite Rule: `/*` -> `/index.html`.
   - Set Build Variable: `VITE_API_GATEWAY_URL=https://fintrack-gateway.onrender.com/api`.

### 8.5 Production Security & Cookie Configuration

#### Cross-Subdomain Cookie Constraints on `onrender.com`
- Render provides default domains formatted as `https://<service-name>.onrender.com`.
- **Public Suffix List (PSL)**: Because `onrender.com` is registered on the PSL, browsers treat `fintrack-frontend.onrender.com` and `fintrack-gateway.onrender.com` as **cross-site**.
- **Required Configuration**:
  - `COOKIE_SECURE=true`: Guarantees transmission strictly over HTTPS.
  - `COOKIE_SAMESITE=none`: Required so browsers transmit the `refreshToken` cookie during cross-site requests to `/api/auth/refresh`.
  - Gateway CORS: Configured with `credentials: true` and explicit origin `https://fintrack-frontend.onrender.com`.
  - Gateway CSRF Protection: Validates the incoming `Origin` header against the allowlist on `/refresh` and `/logout`.

### 8.6 Deployment Order & Health Verification

1. **Step 1: Check Infrastructure**:
   - Test MongoDB Atlas connectivity.
   - Test CloudAMQP AMQPS connectivity.
2. **Step 2: Deploy Backend Microservices**:
   - Deploy `auth-service`, `transaction-service`, `notification-service`.
   - Render verifies TCP socket readiness on their respective ports (5001, 5002, 5003).
3. **Step 3: Deploy API Gateway**:
   - Deploy `fintrack-gateway`.
   - Verify health:
     ```bash
     curl -i https://fintrack-gateway.onrender.com/health
     ```
   - Expect HTTP 200:
     ```json
     {
       "status": "ok",
       "service": "api-gateway",
       "routes": {
         "auth": "http://auth-service:5001",
         "transactions": "http://transaction-service:5002",
         "notifications": "http://notification-service:5003"
       }
     }
     ```
4. **Step 4: Deploy Frontend Static Site**:
   - Deploy `fintrack-frontend`.
   - Open `https://fintrack-frontend.onrender.com` in a browser.
   - Verify registration, login, transaction creation, and threshold notifications.

### 8.7 Rollback Procedure

Render maintains historical deployment artifacts for all services:
1. In the Render Dashboard, select the failed service.
2. Navigate to the **Deploys** tab.
3. Locate the previous successful deploy.
4. Click the three dots (`...`) and select **Rollback to this deploy**.
5. Render immediately reactivates the previous Docker container image or static build with zero re-compilation delay.

### 8.8 Known Architecture Limitation: Transactional Outbox

FinTrack currently implements a **Synchronous DB Write + Asynchronous RabbitMQ Publish with In-Memory Retry**:
- When a user creates an expense transaction, the Transaction Service commits the record to `fintrack_transactions` via MongoDB.
- It then immediately attempts to publish the event `expense.created` to RabbitMQ with publisher confirms.
- If RabbitMQ is unavailable during the request, the transaction is successfully saved, the HTTP response returns HTTP 201 with `eventPublished: false`, and an in-memory retry loop attempts to deliver the event.
- **Limitation**: If the Transaction Service process crashes or restarts before an in-memory retry succeeds, the notification event could be lost.
- **Future Milestone 2 Mitigation**: Implement a persistent Transactional Outbox pattern by storing events in an `outbox` MongoDB collection inside a two-phase transaction and dispatching them via a Change Stream or dedicated polling worker.

