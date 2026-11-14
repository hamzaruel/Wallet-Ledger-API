# Wallet Ledger API — Project Progress

## 1. Project name and purpose

**Wallet Ledger API** is a backend recruitment assessment project for a secure, concurrent wallet transaction system. The planned API supports credit, debit, and balance lookup while maintaining accurate balances and an immutable transaction ledger.

## 2. Technology stack

- Node.js 22 and JavaScript (CommonJS)
- Express 5
- PostgreSQL 17
- `pg` connection pool
- Pino structured logging with `pino-http`
- Docker and Docker Compose
- `dotenv` for local environment configuration

## 3. Current folder structure

```text
Wallet Ledger API/
├── .dockerignore
├── .env.example
├── architecture.md
├── docker-compose.yml
├── Dockerfile
├── package-lock.json
├── package.json
├── PROJECT_PROGRESS.md
└── src/
    ├── app.js
    ├── config/
    │   └── env.js
    ├── db/
    │   └── pool.js
    ├── logger.js
    └── server.js
```

No migrations, wallet modules, test directories, or load-test files have been created yet.

## 4. Files created so far

- `architecture.md` — approved architecture and phase plan, including static bearer token authentication, the three required routes, transactional wallet/ledger updates, and Docker Compose startup expectations.
- `package.json` — project metadata, dependencies, scripts, and Node.js engine requirement.
- `package-lock.json` — locked dependency tree for repeatable npm installs.
- `.dockerignore` — excludes local dependencies, environment secrets, and unrelated files from the Docker build context.
- `.env.example` — documents local configuration variables and defaults.
- `Dockerfile` — builds the API image on Node 22 Alpine and runs it as the non-root `node` user.
- `docker-compose.yml` — defines PostgreSQL and API services, database health checking, API startup dependency, persistent database storage, and the `API_TOKEN` default.
- `src/config/env.js` — loads and validates application environment settings.
- `src/logger.js` — configures structured logging and authorization-header redaction.
- `src/db/pool.js` — configures the PostgreSQL connection pool and logs idle-client errors.
- `src/app.js` — configures Express JSON parsing, request logging, not-found handling, and centralized error handling. No assessment routes have been added.
- `src/server.js` — verifies database connectivity before listening and handles graceful shutdown.
- `PROJECT_PROGRESS.md` — this progress record.

## 5. Phase 2 implementation

**Phase 2: Project Foundation and Docker Compose Setup** is implemented at the file/configuration level.

- Initialized the Node.js and Express project.
- Added PostgreSQL pool configuration.
- Added structured request/application logging and centralized error handling.
- Added a Dockerfile.
- Added Docker Compose configuration for PostgreSQL and the API.
- Configured `API_TOKEN` in Compose with the default `recruitment-test-token`, while allowing an environment override.
- Configured Compose to wait for PostgreSQL’s health check before starting the API.
- Configured the API to run `SELECT 1` before opening its HTTP listener.
- Set up the project so the intended startup command is `docker compose up --build`.

The required assessment API routes and token verification middleware are not part of Phase 2 and have not been implemented.

## 6. Not implemented yet

- Actual Docker image build or Compose startup verification.
- Authentication middleware and constant-time bearer token checking.
- The exact assessment routes: `POST /credit`, `POST /debit`, and `GET /balance/:user_id`.
- Assessment request validation, success response formats, error structures, and status codes.
- Database schema, migrations, wallet balance table, immutable ledger table, and indexes.
- Atomic credit/debit transactions, row-level locking, and overdraft prevention.
- Optional idempotency support.
- Automated integration/concurrency tests and load tests.
- Reconciliation and final operational documentation.

## 7. Current verification status

- JavaScript syntax checks passed for the source files.
- The dependency lockfile was generated and npm reported no dependency vulnerabilities at that time.
- `npm ls --package-lock-only --depth=0` reported the expected top-level dependencies.
- No application integration tests or API behavior tests have been run; no API routes exist yet.

## 8. Pending Docker verification

Docker verification is pending because the Docker CLI was not available in the implementation environment. Therefore, the image build, PostgreSQL health check, API startup, and Compose behavior have not been confirmed by actually running containers.

## 9. Remaining development phases, in order

1. **Verify Docker installation and Compose startup** — build and start the API and PostgreSQL containers, then confirm both are running and PostgreSQL is healthy.
2. **Confirm the assessment API contract** — use the original assessment’s exact request bodies, success responses, validation rules, error structure, and status codes.
3. **Create database schema and migrations** — add users/wallet data as required by the assessment, immutable ledger storage, constraints, and indexes.
4. **Implement static bearer authentication** — require `API_TOKEN` and compare bearer tokens in constant time before any database access.
5. **Implement balance lookup** — add `GET /balance/:user_id` to the exact assessment contract.
6. **Implement credit and debit** — add `POST /credit` and `POST /debit`, with atomic balance/ledger writes, row locking, and overdraft protection. Keep `Idempotency-Key` optional.
7. **Add automated tests** — cover required behavior, validation/authentication errors, rollback, and concurrent wallet operations.
8. **Assess performance and scale** — load representative data, inspect query plans/indexes, and run load tests.
9. **Complete operational documentation** — document setup, API behavior, design decisions, test results, and measured performance.

## 10. Exact next step

**Verify Docker installation and run `docker compose up --build`.** Then confirm the API and PostgreSQL containers start successfully and the database health check passes. Do not begin the next development phase until this Phase 2 review is approved.

---

Update this document after every completed development phase so work can resume from this file if the conversation is lost.
