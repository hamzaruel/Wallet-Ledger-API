const pino = require('pino');
const env = require('./config/env');

const logger = pino({
  level: env.logLevel,
  redact: {
    paths: ['req.headers.authorization', 'headers.authorization'],
    censor: '[REDACTED]'
  },
  base: {
    service: 'wallet-ledger-api',
    environment: env.nodeEnv
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = logger;
