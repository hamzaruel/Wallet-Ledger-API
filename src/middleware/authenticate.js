const crypto = require('node:crypto');
const env = require('../config/env');
const { ApiError } = require('../shared/errors');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest();
const expectedDigest = sha256(env.apiToken);

function authenticate(req, res, next) {
  const header = req.get('authorization');
  const match = typeof header === 'string' ? /^Bearer +(.+)$/i.exec(header) : null;

  // Compare fixed-length digests in constant time. No database access happens here.
  if (!match || !crypto.timingSafeEqual(sha256(match[1]), expectedDigest)) {
    res.set('WWW-Authenticate', 'Bearer');
    return next(new ApiError(401, 'unauthorized', 'Missing or invalid bearer token'));
  }

  return next();
}

module.exports = authenticate;