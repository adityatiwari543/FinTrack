# FINTRACK INFRASTRUCTURE, DOCKER & DEPLOYMENT SECURITY AUDIT

**Project**: FinTrack Personal Finance Application  
**Standard**: CIS Docker Benchmark, NIST SP 800-190 (Application Container Security Guide)  
**Components**: Dockerfiles (5 Units), Docker Compose, GitHub Actions CI/CD Pipeline  

---

## 1. Container Hardening & Multi-Stage Dockerfiles

All five application units feature hardened, production-optimized Dockerfiles audited against the CIS Docker Benchmark.

### 1.1 Multi-Stage Architecture & Image Footprint
- **Backend Services (Gateway, Auth, Transaction, Notification)**:
  - **Build Stage**: Uses `node:20-alpine`, runs `npm ci --omit=dev` to install only production dependencies.
  - **Production Stage**: Uses minimal `node:20-alpine`, copies over only needed artifacts (`node_modules`, `src`, `package.json`), stripping compilers, source maps, and development dependencies.
- **Frontend Service**:
  - **Build Stage**: Uses `node:20-alpine`, runs `npm ci` and `npm run build` to generate static assets via Vite.
  - **Production Stage**: Employs `nginxinc/nginx-unprivileged:alpine`, serving static files on non-privileged port 8080.

### 1.2 Least-Privilege Non-Root Execution
Running containerized applications as `root` (UID 0) presents a critical privilege escalation risk. 

| Container Unit | Base Image | Configured User | Privilege Level | Status |
| :--- | :--- | :---: | :---: | :---: |
| **API Gateway** | `node:20-alpine` | `USER node` | Non-Root (UID 1000) | **HARDENED** |
| **Auth Service** | `node:20-alpine` | `USER node` | Non-Root (UID 1000) | **HARDENED** |
| **Transaction Service** | `node:20-alpine` | `USER node` | Non-Root (UID 1000) | **HARDENED** |
| **Notification Service** | `node:20-alpine` | `USER node` | Non-Root (UID 1000) | **HARDENED** |
| **Frontend** | `nginx-unprivileged:alpine` | `USER 101 (nginx)` | Non-Root (Port 8080) | **HARDENED** |

---

## 2. Docker Compose Network & Service Isolation

### 2.1 Network Segmentation
- All containers are connected to an internal user-defined bridge network `fintrack-net`.
- In a production topology, ports 5001, 5002, and 5003 are **not** exposed to the host machine. Downstream services communicate strictly via internal Docker DNS (`http://auth-service:5001`, etc.).
- Only the API Gateway (`8000:8000`) and Frontend (`80:8080` / `5173:8080`) are accessible from the host.

### 2.2 Healthcheck Configurations & Startup Dependencies
All containers declare native Docker healthchecks verifying their respective `/health` endpoints:
```yaml
healthcheck:
  test: ["CMD-SHELL", "wget -q --spider http://localhost:5001/health || exit 1"]
  interval: 15s
  timeout: 5s
  retries: 5
  start_period: 20s
```
The API Gateway specifies `depends_on` conditions with `condition: service_healthy` to ensure downstream microservices are fully initialized before the Gateway begins routing external traffic.

---

## 3. GitHub Actions CI/CD Pipeline Security (`.github/workflows/ci-cd.yml`)

The CI/CD pipeline was inspected for workflow security and best practices:

```
[ Push / PR to main ]
          │
          ├─────────────────────────────────────────────────┐
          ▼                                                 ▼
   [ Job 1: Lint ]                                  [ Job 2: Test ]
(Monorepo ESLint across 5 units)           (Unit & Integration Tests across 5 units)
          │                                                 │
          └───────────────────────┬─────────────────────────┘
                                  ▼
                        [ Job 3: Build ]
              (Vite Production Frontend Build)
                                  │
                                  ▼ (On Merge to Main Only)
                        [ Job 4: Docker & GHCR ]
              (Build 5 Docker images & Push to ghcr.io)
```

### Security Audit Findings for CI/CD
1. **Zero Secret Hardcoding**: Secrets such as `INTERNAL_SERVICE_SECRET`, `JWT_SECRET`, and registry credentials are read strictly from GitHub Actions encrypted secrets (`${{ secrets.* }}`).
2. **Minimal GitHub Token Permissions**: The workflow requests explicit permissions:
   ```yaml
   permissions:
     contents: read
     packages: write
   ```
3. **No Deploy Without Testing**: Docker image builds and GHCR publishing are gated behind successful completion of `lint`, `test`, and `build` jobs.

---

## 4. Infrastructure Audit Verdict

The containerization and CI/CD configurations adhere to modern DevOps security standards:
- Non-root user privileges enforced across all 5 containers.
- Zero credential leakage in Dockerfiles or images.
- Multi-stage builds minimizing attack surface.
- Production-grade health checks and deterministic startup orchestration.
- **Rating: PRODUCTION-READY**.
