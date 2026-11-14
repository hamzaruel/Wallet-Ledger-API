const app = require('./app');
const env = require('./config/env');
const pool = require('./db/pool');
const logger = require('./logger');

async function start() {
  await pool.query('SELECT 1');

  const server = app.listen(env.port, () => {
    logger.info({ port: env.port }, 'Wallet Ledger API is listening');
  });

  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    server.close(async (error) => {
      if (error) logger.error({ err: error }, 'Error while closing HTTP server');
      try {
        await pool.end();
      } catch (poolError) {
        logger.error({ err: poolError }, 'Error while closing PostgreSQL pool');
      }
      process.exit(error ? 1 : 0);
    });
  }

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch(async (error) => {
  logger.fatal({ err: error }, 'Failed to start Wallet Ledger API');
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
