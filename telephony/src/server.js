const express = require('express');
const pinoHttp = require('pino-http');
const crypto = require('crypto');

const config = require('./config');
const { logger, newId } = require('./lib/logger');
const { verify } = require('./lib/hmac');
const ami = require('./asterisk/ami');
const amiEvents = require('./asterisk/events');
const apiRoutes = require('./api/routes');
const { drainQueue, queue } = require('./crm/client');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // behind nginx

// Capture raw body for HMAC verification.
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf && buf.length ? buf.toString('utf8') : '';
    },
  })
);

app.use(
  pinoHttp({
    logger,
    genReqId: () => newId('req'),
    autoLogging: { ignore: (req) => req.url === '/healthz' },
  })
);

// Liveness (no auth) — for the systemd/nginx/uptime probe.
app.get('/healthz', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ── HMAC gate for every /* API route (requests come from the CRM) ──────
const seenNonces = new Map(); // nonce -> expiry  (in-memory replay guard)
setInterval(() => {
  const now = Date.now();
  for (const [n, exp] of seenNonces) if (exp < now) seenNonces.delete(n);
}, 60_000).unref();

app.use((req, res, next) => {
  if (req.path === '/healthz') return next();
  if (!config.ready.inbound) {
    return res.status(503).json({ ok: false, error: 'Service not configured (CRM_HMAC_SECRET missing).' });
  }
  const v = verify({
    apiKey: config.inbound.apiKey,
    secret: config.inbound.hmacSecret,
    toleranceSec: config.inbound.toleranceSec,
    headers: req.headers,
    rawBody: req.rawBody || '',
  });
  if (!v.ok) return res.status(401).json({ ok: false, error: `signature rejected: ${v.reason}` });
  if (seenNonces.has(v.nonce)) return res.status(409).json({ ok: false, error: 'replayed nonce' });
  seenNonces.set(v.nonce, Date.now() + config.inbound.toleranceSec * 1000);
  req.correlationId = req.headers['x-correlation-id'] || newId('cor');
  next();
});

app.use('/', apiRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error({ err: err.message, stack: err.stack }, 'unhandled route error');
  if (!res.headersSent) res.status(500).json({ ok: false, error: 'internal error' });
});

// ── boot ──────────────────────────────────────────────────────────────
amiEvents.attach();
ami.connect();

// Retry any queued CRM events every 10s.
setInterval(() => {
  drainQueue().catch((e) => logger.warn({ err: e.message }, 'queue drain error'));
}, 10_000).unref();

const server = app.listen(config.port, config.bind, () => {
  logger.info(
    {
      addr: `${config.bind}:${config.port}`,
      crmConfigured: config.ready.crm,
      inboundConfigured: config.ready.inbound,
      vicidial: config.vicidial.enabled,
      sipOutbound: config.sip.outboundEnabled,
      queued: queue.size(),
    },
    'telephony integration service listening'
  );
});

function shutdown(sig) {
  logger.info({ sig }, 'shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (e) => logger.error({ err: e && e.message }, 'unhandledRejection'));
