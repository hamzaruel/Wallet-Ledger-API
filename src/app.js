const express = require('express');
const pinoHttp = require('pino-http');
const logger = require('./logger');

const app = express();

app.disable('x-powered-by');
app.use(pinoHttp({ logger }));
app.use(express.json({ limit: '16kb' }));

app.use((req, res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.path}`);
  error.statusCode = 404;
  next(error);
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const candidateStatus = error.statusCode ?? error.status;
  const statusCode =
    Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599
      ? candidateStatus
      : 500;

  if (statusCode >= 500) {
    req.log.error({ err: error }, 'Request failed');
  } else {
    req.log.warn({ statusCode, message: error.message }, 'Request rejected');
  }

  return res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal server error' : error.message
  });
});

module.exports = app;
