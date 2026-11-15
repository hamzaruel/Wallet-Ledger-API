const path = require('node:path');

require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

function positiveInteger(value, fallback, name) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

const apiToken = process.env.API_TOKEN;

if (!apiToken) {
  throw new Error('API_TOKEN is required');
}

const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: positiveInteger(process.env.PORT, 8080, 'PORT'),
  apiToken,
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://wallet_app:wallet_app_password@localhost:5432/wallet_ledger',
  pgPoolMax: positiveInteger(process.env.PG_POOL_MAX, 20, 'PG_POOL_MAX'),
  logLevel: process.env.LOG_LEVEL ?? 'info'
});

module.exports = env;
