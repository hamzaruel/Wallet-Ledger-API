-- seed.sql: 10,915,000 ledger rows, 100,000 users, matching wallets.
-- Rows alternate credit/debit per user and each debit is at most 80 percent of
-- the credit just before it, so no running balance is ever below 0.
-- Wallets are computed from the ledger, so they always match it.

\timing on
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ledger LIMIT 1) OR EXISTS (SELECT 1 FROM wallets LIMIT 1) THEN
    RAISE EXCEPTION 'ledger or wallets not empty: seed aborted';
  END IF;
END $$;

SET LOCAL synchronous_commit = off;
SET LOCAL work_mem = '64MB';

WITH tiers AS (
  SELECT g AS n,
         'u' || lpad(g::text, 6, '0') AS user_id,
         CASE WHEN g <= 10 THEN 250000
              WHEN g <= 1000 THEN 3000
              ELSE 55 END AS cnt
  FROM generate_series(1, 100000) AS g
), ranged AS (
  SELECT n, user_id, cnt,
         SUM(cnt) OVER (ORDER BY n) - cnt AS base_id
  FROM tiers
)
INSERT INTO ledger (id, user_id, type, amount, created_at)
SELECT r.base_id + k,
       r.user_id,
       CASE WHEN k % 2 = 1 THEN 'credit' ELSE 'debit' END,
       CASE WHEN k % 2 = 1 THEN c.credit_amt
            ELSE (c.credit_amt * (1 + (p.j % 4))) / 5 END,
       TIMESTAMPTZ '2026-01-01 00:00:00+00' + (k * INTERVAL '1 minute')
FROM ranged r
CROSS JOIN LATERAL generate_series(1, r.cnt) AS k
CROSS JOIN LATERAL (SELECT ((k + 1) / 2)::bigint AS j) p
CROSS JOIN LATERAL (
  SELECT 1000 + ((r.n::bigint * 7919 + p.j * 104729) % 99000) AS credit_amt
) c;

INSERT INTO wallets (user_id, balance)
SELECT user_id,
       SUM(CASE type WHEN 'credit' THEN amount ELSE -amount END)
FROM ledger
GROUP BY user_id;

SELECT setval(pg_get_serial_sequence('ledger', 'id'), (SELECT max(id) FROM ledger));

COMMIT;

ANALYZE ledger;
ANALYZE wallets;

SELECT (SELECT count(*) FROM ledger) AS ledger_rows,
       (SELECT count(*) FROM wallets) AS wallets;