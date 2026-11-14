const { Pool } = require('pg');
const env = require('../config/env');
const logger = require('../logger');

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.pgPoolMax,
  application_name: 'wallet-ledger-api'
});

pool.on('error', (error) => {
  logger.error({ err: error }, 'Unexpected PostgreSQL idle-client error');
});

module.exports = pool;
