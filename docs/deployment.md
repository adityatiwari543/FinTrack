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
