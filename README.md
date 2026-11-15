# Wallet Ledger API

Recruitment assessment project: a PostgreSQL-backed HTTP API for wallet credits, debits, and balance lookups.

## Run the API

The assessment startup command is:

```powershell
docker compose up --build
```

The API is configured to serve on `http://localhost:8080`. Set `API_TOKEN` in the environment to override the default provided by `docker-compose.yml`. Every endpoint requires `Authorization: Bearer <token>`.

## API

All amounts and balances are integer minor units.

| Method and path | Request | Success |
| --- | --- | --- |
| `POST /credit` | `{"user_id":"u123","amount":10000}` | `200 {"user_id":"u123","balance":25000}` |
| `POST /debit` | `{"user_id":"u123","amount":4000}` | `200 {"user_id":"u123","balance":21000}` |
| `GET /balance/:user_id` | No body | `200 {"user_id":"u123","balance":21000}` |

Credits create wallets. Debits reject overdrafts. Invalid input returns `400`, missing or invalid authentication returns `401`, unknown users on balance/debit return `404`, and insufficient funds return `409`. Error responses use `{"error":"<code>","message":"<text>"}`.

## Data and correctness

PostgreSQL stores wallet balances in `wallets` and transaction history in `ledger`. The ledger is the audit history; each credit or debit is represented by a ledger row. The API and migration implementation are under `src/`.

The automated API suite is in `tests/api.test.js`. It covers authentication, contract and validation behavior, competing debits, 1,000 concurrent credits, hot-user debits, simultaneous traffic on different users, and read-your-writes. Verified run against the main API on port 8080 (database with 10.9M ledger rows) on 15 November 2026: **8 tests passed, 0 failed**.

Run the suite against an API already listening on port 8080:

```powershell
$env:BASE_URL = 'http://localhost:8080'
$env:API_TOKEN = 'recruitment-test-token'
node --test .\tests\api.test.js
```

## Assessment seed

`seed/seed.sql` is the assessment seed. It generates **10,915,000 ledger rows across 100,000 users** with an uneven distribution; the first ten users have 250,000 rows each. It refuses to run if `ledger` or `wallets` is non-empty. Run it only against a fresh assessment database, never against a populated database.

Seed runtime: **1 min 42 s** for the full 10,915,000 rows, measured on a fresh empty database started from a clean clone, using the command below (Windows laptop, Docker Desktop, 4 CPUs, 3.7 GB RAM). An earlier run on the original database took 5 min 19 s. After seeding, both consistency checks returned 0 violations: wallet balances versus ledger sums, and no user with a negative running balance at any point. To seed a fresh database: `Get-Content seed\seed.sql | docker compose exec -T db psql -U wallet_app -d wallet_ledger`.



## Performance results (10.9M ledger rows)

Measured against the main database (`docker compose up`, port 8080), seeded with 10,915,000 rows (10,938,510 after the test runs), 100,000+ users, 100 concurrent clients, 10,000 requests per scenario, Docker Desktop on a Windows laptop. Script: `load-test/load.js`, raw output: `load-test/results.json`.

| Scenario | Endpoint | p50 | p99 |
| --- | --- | ---: | ---: |
| Mixed (random users) | credit | 312 ms | 1,714 ms |
| Mixed (random users) | debit | 312 ms | 1,652 ms |
| Mixed (random users) | balance | 307 ms | 1,136 ms |
| Hot user (one wallet) | credit | 508 ms | 3,233 ms |
| Hot user (one wallet) | debit | 424 ms | 2,731 ms |
| Hot user (one wallet) | balance | 341 ms | 1,724 ms |

Mixed throughput was 257 req/s and hot-user throughput 181 req/s. All 20,000 requests returned 2xx, with 0 unexpected failures.

An earlier run on a 1M-row database (different load script and setup, so not strictly like-for-like) had a mixed p50 of 464 ms, so latency did not grow with table size. A single request with no load takes about 25-40 ms including curl start-up; the latency under load is mostly queueing (100 clients, DB pool of 20, one Node process, Docker on Windows), not slow queries.

Reconciliation after the load tests (10,938,510 ledger rows): 0 negative wallets, 0 wallets whose balance differs from the ledger sum.

## Query plans (EXPLAIN ANALYZE, 10.9M rows)

Balance: `SELECT balance FROM wallets WHERE user_id = $1`

    Index Scan using wallets_pkey on wallets (actual time=0.110..0.113 rows=1)
      Index Cond: (user_id = 'u000001')
      Buffers: shared hit=3
    Execution Time: 0.265 ms

Debit: `UPDATE wallets ... WHERE user_id = $1 AND balance >= $2` plus a ledger insert in the same statement

    Update on wallets -> Index Scan using wallets_pkey (Filter: balance >= 1)
    Insert on ledger (only if the update matched a row)
    Execution Time: 0.627 ms

Credit: upsert on `wallets` (`ON CONFLICT (user_id) DO UPDATE`) plus a ledger insert in the same statement

    Insert on wallets, Conflict Arbiter Indexes: wallets_pkey, Conflict Resolution: UPDATE
    Insert on ledger
    Execution Time: 4.309 ms

No plan scans the ledger table or a user's history. The queries only touch the `wallets_pkey` index and append one ledger row.

## Design decisions

- **Schema:** `ledger` is the immutable source of truth (id, user_id, type, amount > 0, created_at). A trigger blocks UPDATE and DELETE. `wallets(user_id, balance)` holds one row per user with a `balance >= 0` check.
- **Balance:** `get_balance` reads one row from `wallets` (primary-key lookup), so it stays fast at any ledger size. The wallet row and the ledger row are written in one SQL statement, so they cannot disagree. Reconciliation SQL confirms this after the load test.
- **Concurrency:** each credit/debit is one statement, which is atomic. A debit does `UPDATE ... WHERE balance >= amount`, so the check and the subtraction happen under the row lock. Two concurrent debits of 60 on a balance of 100 give one 200 and one 409. Credits use an atomic upsert on the same row, so no update is lost.
- **Isolation level:** PostgreSQL default READ COMMITTED. This is enough because every write is a single statement that locks the wallet row; after waiting for the lock, Postgres re-checks the `balance >= amount` condition on the latest row version.
- **Isolation across users:** locks are per wallet row, so heavy traffic on one user only queues requests for that user.
- **Auth:** static bearer token from `API_TOKEN`, compared in constant time, checked before any database access.

### Alternatives rejected

- Computing the balance with `SUM(ledger)` per request: too slow at 10M+ rows.
- `SELECT ... FOR UPDATE` followed by a separate `UPDATE` in an explicit transaction: more round trips and longer lock hold time for the same result.
- `SERIALIZABLE` isolation: needs retry handling for serialization failures and gives no benefit when every write is a single-row atomic statement.
- Application-level locks or an in-memory balance cache: break with more than one API instance and lose data on a crash.

## Known limits

- The database runs with default PostgreSQL settings (`shared_buffers` 128MB, `synchronous_commit` on, `max_connections` 100). Every write waits for a disk flush, which is slow on Docker for Windows.
- The API is a single Node.js process with a DB pool of 20, so 100 clients queue. This is the first thing that breaks at 10x load.
- A single hot user is serialized by the row lock; throughput on one wallet is bounded by commit latency.
- At 10x load: add PgBouncer or a larger pool, tune PostgreSQL (`shared_buffers`, WAL settings), partition or archive old ledger rows, and run more API instances.
- With several API instances the design stays correct, because all coordination happens in PostgreSQL row locks. The pool sizes would have to be kept below `max_connections`.

## What I would do with more time

- Tune PostgreSQL and the pool size and re-run the benchmark.
- Add the `Idempotency-Key` header on credit/debit, a health endpoint and graceful shutdown.
- Run the 10x load test and a multi-instance test behind a load balancer.
- Run a clean-database seed to confirm the seed timing again.
