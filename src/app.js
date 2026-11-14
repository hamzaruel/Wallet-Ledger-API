const express = require('express');
const pinoHttp = require('pino-http');
const logger = require('./logger');
const authenticate = require('./middleware/authenticate');
const { ApiError } = require('./shared/errors');

const app = express();

app.disable('x-powered-by');
app.use(pinoHttp({ logger }));

// Auth runs first for EVERY request, before body parsing and before any database access.
app.use(authenticate);
app.use(express.json({ limit: '16kb' }));

app.use(require('./modules/wallet/wallet.routes'));

app.use((req, res, next) => {
  next(new ApiError(404, 'not_found', `Route not found: ${req.method} ${req.path}`));
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  let statusCode;
  let code;
  let message;

  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
  } else if (Number.isInteger(error.status ?? error.statusCode) && (error.status ?? error.statusCode) < 500) {
    // Body-parser problems (malformed JSON, body too large, ...)
    statusCode = 400;
    code = 'invalid_request';
    message = 'Malformed or invalid request body';
  } else {
    statusCode = 500;
    code = 'internal_error';
    message = 'Internal server error';
  }

  if (statusCode >= 500) {
    req.log.error({ err: error }, 'Request failed');
  } else {
    req.log.warn({ statusCode, code }, 'Request rejected');
  }

  return res.status(statusCode).json({ error: code, message });
});

module.exports = app;