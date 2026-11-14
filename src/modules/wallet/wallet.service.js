const repo = require('./wallet.repository');
const { ApiError } = require('../../shared/errors');

// Serialization failures and deadlocks are retried, never shown to the client as a 500.
const RETRYABLE = new Set(['40001', '40P01']);

async function withRetry(fn) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!RETRYABLE.has(error.code) || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5 * attempt));
    }
  }
}

async function getBalance(userId) {
  const balance = await repo.getBalance(userId);
  if (balance === null) {
    throw new ApiError(404, 'user_not_found', 'User has never been credited');
  }
  return balance;
}

function credit(userId, amount) {
  return withRetry(() => repo.credit(userId, amount));
}

async function debit(userId, amount) {
  const balance = await withRetry(() => repo.debit(userId, amount));
  if (balance !== null) return balance;

  // No row was updated: either the user does not exist, or the funds are too low.
  if (!(await repo.walletExists(userId))) {
    throw new ApiError(404, 'user_not_found', 'User has never been credited');
  }
  throw new ApiError(409, 'insufficient_funds', 'Debit is larger than the current balance');
}

module.exports = { getBalance, credit, debit };