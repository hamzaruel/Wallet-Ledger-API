const { ApiError } = require('../../shared/errors');

const USER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_AMOUNT = 1_000_000_000;

const invalid = (message) => new ApiError(400, 'invalid_request', message);

function parseUserId(value) {
  if (typeof value !== 'string' || !USER_ID_RE.test(value)) {
    throw invalid('user_id must be 1-64 characters: letters, digits, _ or -');
  }
  return value;
}

function parseAmount(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_AMOUNT) {
    throw invalid('amount must be an integer between 1 and 1000000000');
  }
  return value;
}

function parseMoneyBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw invalid('Request body must be a JSON object');
  }
  return { userId: parseUserId(body.user_id), amount: parseAmount(body.amount) };
}

module.exports = { parseUserId, parseAmount, parseMoneyBody };