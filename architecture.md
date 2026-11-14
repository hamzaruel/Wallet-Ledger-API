# Wallet Ledger API — Proposed Architecture

## Requirements and constraints

The API supports multiple users and exactly three wallet operations: credit, debit, and balance lookup. It must maintain accurate balances under concurrent requests, reject overdrafts, and handle at least 100,000 users and 10 million ledger records. It must use Node.js, Express, PostgreSQL, Docker Compose, and JavaScript, with automated and load testing.

The workspace is otherwise empty. This document describes the architecture only; implementation will begin after approval.

## API contract

Implement exactly these routes:

- `POST /credit`
- `POST /debit`
- `GET /balance/:user_id`

Credit and debit accept `user_id` from the request body. Balance lookup accepts it from the URL. There is no user login, registration, or per-user ownership authorization. All three routes require the static bearer token described below.

Request fields, response bodies, and HTTP status codes must match the recruitment assessment exactly. Those exact schemas and examples have not been provided in the project requirements so far, so they must be taken from the assessment text before implementing route validation and responses. They should not be guessed.

`Idempotency-Key` may be supported as an optional request header. It must not make the header mandatory or alter the required request or response formats.

## Authentication

Use the static token in the `API_TOKEN` environment variable. Docker Compose will provide it with the default value `recruitment-test-token`.

Authentication middleware runs before any database access, including health or other endpoints if any are later added. For the three required API routes, missing or invalid bearer tokens are rejected before a database connection or query is made. Compare tokens in constant time: hash both the configured token and supplied token to fixed-length digests, then compare the digests using Node.js `crypto.timingSafeEqual`. Handle missing/malformed authorization headers without accessing the database.

## Wallet and ledger architecture

Use a modular Express application backed by PostgreSQL. The ledger is the immutable record of wallet activity. A wallet row holds the current balance for fast reads. Every successful credit or debit updates the wallet balance and inserts its ledger entry in the same database transaction.

```text
HTTP request
    │
    ├── Bearer token authentication (before database access)
    ├── Request validation using the assessment contract
    └── Route → Wallet service → PostgreSQL transaction
                         ├── Lock wallet row with SELECT ... FOR UPDATE
                         ├── Check funds for a debit
                         ├── Insert immutable ledger entry
                         └── Update wallet balance
```

For a debit, lock the wallet row before checking the balance. If funds are insufficient, roll back and return the assessment’s required error response and status. The wallet balance must never become negative; enforce that invariant in service logic and with a database constraint. Row-level locks serialize operations on the same wallet while allowing transactions on different wallets to proceed independently.

The ledger is append-only: successful operations add entries rather than rewriting history. Keep a database constraint or permissions strategy to prevent accidental modification of historical entries. Balance reads use the wallet balance row rather than summing the full ledger. A reconciliation command can compare wallet balances with ledger totals to detect discrepancies.

Store money as integer minor units (for example, cents) in PostgreSQL `BIGINT`; handle values safely in JavaScript with `BigInt` or decimal strings to avoid floating-point rounding. Start with workload-appropriate indexes and inspect query plans before considering partitioning. Ten million rows is a scale target, not by itself a reason to partition prematurely.

## Idempotency

Idempotency remains optional. If an `Idempotency-Key` is supplied, it can be recorded with the transaction and used to prevent duplicate application on retries. If omitted, the endpoint works according to the required assessment contract. Any replay behavior must preserve that contract and must not introduce mandatory fields or change the required response format.

## Docker Compose startup

The project should start with only:

```sh
docker compose up
```

Compose will start PostgreSQL and the API. PostgreSQL will have a health check, and the API will wait for the database to be healthy. The API container will apply database migrations as part of its startup command before listening for requests, so no separate migration command is needed for a fresh local environment. `API_TOKEN` will be configured in `docker-compose.yml` with the default `recruitment-test-token`, while still allowing an environment override.

## Proposed folder structure

```text
wallet-ledger-api/
├── src/
│   ├── app.js
│   ├── server.js
│   ├── config/
│   │   └── env.js
│   ├── db/
│   │   ├── pool.js
│   │   ├── migrate.js
│   │   └── migrations/
│   ├── middleware/
│   │   ├── authenticate.js
│   │   ├── validate.js
│   │   └── errorHandler.js
│   ├── modules/
│   │   └── wallet/
│   │       ├── wallet.routes.js
│   │       ├── wallet.controller.js
│   │       ├── wallet.service.js
│   │       └── wallet.repository.js
│   └── shared/
│       ├── errors.js
│       └── logger.js
├── tests/
│   ├── integration/
│   └── helpers/
├── load-tests/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
└── README.md
```

`app.js` configures Express and middleware; `server.js` starts the listener. Authentication and request validation middleware run before wallet route handlers. The wallet service owns business rules and transaction boundaries; the repository contains SQL access. Migrations define the schema, constraints, and indexes. Integration tests exercise the API against PostgreSQL, and load tests measure behavior at realistic concurrency and data volumes.

## Development phases

1. **Confirm the assessment contract**  
   Capture the exact request fields, responses, and status codes for all three endpoints from the assessment. This is required before implementing validation and error responses.

2. **Project foundation and Compose startup**  
   Set up the Node.js app, environment configuration, logging, error handling, Docker Compose, database health checks, and startup migrations so `docker compose up` is sufficient.

3. **Schema and migrations**  
   Create wallet and immutable ledger tables, database constraints, and indexes. Add any user/account setup required by the assessment’s test data expectations without adding login or registration endpoints.

4. **Static bearer authentication**  
   Implement `API_TOKEN` loading and constant-time comparison. Verify authentication rejects requests before any database access.

5. **Balance endpoint**  
   Implement `GET /balance/:user_id` using the assessment’s exact response and error contract.

6. **Credit and debit operations**  
   Implement `POST /credit` and `POST /debit` with row-level locking, atomic ledger and balance updates, optional idempotency, and assessment-compliant errors.

7. **Automated tests**  
   Add integration tests for normal operations, validation and authentication failures, insufficient funds, idempotent retries when used, and concurrent credits/debits.

8. **Performance and scale assessment**  
   Generate a large ledger dataset, inspect query plans and indexes, and run load tests with increasing concurrency. Tune based on measured bottlenecks.

9. **Operational readiness and documentation**  
   Document Compose startup, environment variables, API examples, migrations, design decisions, and test and load-test results.

Implementation will start after you approve this revised architecture. Before route implementation, the exact assessment request/response examples and status codes will also be needed if they are not already in the project materials.
