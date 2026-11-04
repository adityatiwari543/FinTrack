# FINTRACK - ANTIGRAVITY PROJECT RULES

## 1. Project Objective
Build FinTrack, a production-style MERN personal finance application using independent microservices, Docker, RabbitMQ and GitHub Actions CI/CD.

Follow the supplied Full Stack Developer Assignment PDF as the primary specification.

## 2. Architecture Rules
- Use a monorepo structure.
- Maintain five independent deployable units: Frontend, API Gateway, Auth Service, Transaction Service and Notification Service.
- Each backend service must have its own Dockerfile and package.json.
- Each backend service must own its MongoDB database.
- Never access another service's database directly.
- All frontend API requests must go through the API Gateway.
- Use RabbitMQ for asynchronous expense events.
- Keep service responsibilities strictly separated.

## 3. Technology Rules
- Frontend: React.js, Vite, JavaScript and Tailwind CSS.
- Backend: Node.js, Express.js and JavaScript.
- Database: MongoDB and Mongoose.
- Authentication: JWT and bcrypt.
- Validation: Zod.
- Message broker: RabbitMQ.
- Logging: Pino.
- Testing: Jest and Supertest.
- Containers: Docker and Docker Compose.
- CI/CD: GitHub Actions.
- Registry: GitHub Container Registry.

## 4. Coding Rules
- Write clean, modular and maintainable code.
- Use async/await consistently.
- Use controllers, routes, services and models separately.
- Avoid unnecessary code duplication.
- Use meaningful variable and function names.
- Add centralized error handling.
- Validate every write request.
- Return consistent JSON responses.
- Never use hardcoded secrets or credentials.
- Never commit .env files.
- Keep .env.example updated.
- Add useful comments for complex business logic.

## 5. Security Rules
- Hash passwords using bcrypt.
- Use short-lived JWT access tokens and refresh tokens.
- Store refresh tokens securely as hashes in the Auth database.
- Validate user ownership for every transaction and notification.
- Never expose sensitive information in API responses or logs.
- Configure CORS properly.
- Apply rate limiting at the API Gateway.
- Protect internal service communication.
- Never trust userId supplied directly in request bodies.

## 6. Database Rules
- Use separate databases for Auth, Transactions and Notifications.
- Add appropriate indexes.
- Validate amounts and transaction types.
- Store monetary values consistently.
- Handle database errors properly.
- Prevent duplicate notifications when consuming repeated events.

## 7. Microservices Rules
- Each service must have its own GET /health endpoint.
- Services must communicate through HTTP or RabbitMQ events.
- Propagate request IDs across services.
- RabbitMQ messages should be durable.
- Acknowledge events only after successful processing.
- Handle broker disconnections and consumer failures.
- Do not make notification processing block transaction creation.

## 8. Frontend Rules
- Build a clean, responsive finance dashboard.
- Use reusable components.
- Keep API calls in dedicated service files.
- Implement protected routes.
- Handle loading, empty and error states.
- Display meaningful validation messages.
- Never call backend microservices directly.
- Do not use fake data in place of actual API integration in the final application.

## 9. Testing Rules
- Write Jest and Supertest tests for Auth and Transaction services.
- Test successful and unsuccessful scenarios.
- Test validation and authorization.
- Run tests before considering a phase complete.
- Never disable a failing test just to make CI pass.

## 10. Docker and CI/CD Rules
- Maintain a Dockerfile for every deployable unit.
- Maintain a working docker-compose.yml.
- All configuration must use environment variables.
- GitHub Actions must run lint, tests and Docker builds.
- Push images to GHCR on merge to main.
- Configure actual automated deployment.
- Store secrets in GitHub Actions secrets.

## 11. Development Workflow
- Work phase by phase.
- Never implement the entire application in one operation.
- Before modifying files, inspect the existing project structure.
- Do not overwrite working code without understanding it.
- After every phase, list created and modified files.
- Explain important implementation decisions.
- Run relevant tests and report actual results.
- Do not claim something works without verification.
- Ask before introducing a major architecture change.
- Do not install unnecessary dependencies.
- Maintain meaningful Git commits.

## 12. Interview Readiness
Every major implementation must be understandable and explainable.
Avoid unnecessary abstractions and overengineering.
Document important technical decisions and trade-offs.

## 13. Priority
P0: Fully working mandatory requirements.
P1: Docker, testing, CI/CD and deployment.
P2: Documentation and demo recording.
P3: Optional bonus features.

Never sacrifice a working deployment to implement optional bonus features.
