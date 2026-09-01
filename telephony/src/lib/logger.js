const crypto = require('crypto');
const pino = require('pino');
const config = require('../config');

// Structured logs with a request id + call correlation id on every line.
const logger = pino({
  level: config.logLevel,
  base: { svc: 'telephony' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

function newId(prefix = 'req') {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

module.exports = { logger, newId };
