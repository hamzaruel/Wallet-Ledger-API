const pool = require('../../db/pool');

// One statement = one implicit transaction: the balance change and the ledger row
// are written together or not at all.
const CREDIT_SQL = `
  WITH upsert AS (
    INSERT INTO wallets (user_id, balance) VALUES ($1::text, $2::bigint)
    ON CONFLICT (user_id) DO UPDATE SET balance = wallets.balance + EXCLUDED.balance
    RETURNING balance
  ), led AS (
    INSERT INTO ledger (user_id, type, amount) VALUES ($1::text, 'credit', $2::bigint)
  )
  SELECT balance FROM upsert`;

// The WHERE balance >= amount check and the subtraction happen atomically on the row.
const DEBIT_SQL = `
  WITH upd AS (
    UPDATE wallets SET balance = balance - $2::bigint
    WHERE user_id = $1::text AND balance >= $2::bigint
    RETURNING balance
  ), led AS (
    INSERT INTO ledger (user_id, type, amount)
    SELECT $1::text, 'debit', $2::bigint WHERE EXISTS (SELECT 1 FROM upd)
  )
  SELECT balance FROM upd`;

const toNumber = (row) => (row ? Number(row.balance) : null);

async function getBalance(userId) {
  const { rows } = await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
  return toNumber(rows[0]);
}

async function credit(userId, amount) {
  const { rows } = await pool.query(CREDIT_SQL, [userId, amount]);
  return toNumber(rows[0]);
}

async function debit(userId, amount) {
  const { rows } = await pool.query(DEBIT_SQL, [userId, amount]);
  return toNumber(rows[0]);
}

async function walletExists(userId) {
  const { rowCount } = await pool.query('SELECT 1 FROM wallets WHERE user_id = $1', [userId]);
  return rowCount > 0;
}

module.exports = { getBalance, credit, debit, walletExists };