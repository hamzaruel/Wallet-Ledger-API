-- 001_init.sql: wallets (current balance) + immutable ledger (source of truth)

CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY CHECK (user_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0)
);

CREATE TABLE IF NOT EXISTS ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ledger_user_id_id_idx ON ledger (user_id, id);

CREATE OR REPLACE FUNCTION ledger_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger rows are immutable (% not allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_no_update_delete ON ledger;
CREATE TRIGGER ledger_no_update_delete
  BEFORE UPDATE OR DELETE ON ledger
  FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
