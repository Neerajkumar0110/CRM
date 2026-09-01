const crypto = require('crypto');
const config = require('../config');
const { buildHeaders } = require('../lib/hmac');
const { logger } = require('../lib/logger');
const DiskQueue = require('../lib/diskQueue');

// VPS → CRM. Every telephony event is pushed here. If the CRM is down or
// slow the event lands in a durable disk queue and is retried — it is
// NEVER dropped (spec §28).

const queue = new DiskQueue(config.queue.dir, { maxAttempts: config.queue.maxAttempts });

async function postOnce(payload) {
  if (!config.ready.crm) throw new Error('CRM webhook not configured');
  const url = config.crm.baseUrl + config.crm.webhookPath;
  const { headers, rawBody } = buildHeaders({
    apiKey: config.crm.webhookApiKey,
    secret: config.crm.webhookHmacSecret,
    body: payload,
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, { method: 'POST', headers, body: rawBody, signal: ctrl.signal });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      const err = new Error(`CRM ${res.status}: ${text.slice(0, 200)}`);
      err.retryable = res.status >= 500 || res.status === 429;
      throw err;
    }
    return text ? JSON.parse(text) : { ok: true };
  } catch (err) {
    if (err.name === 'AbortError') err.retryable = true;
    if (err.retryable === undefined) err.retryable = true; // network → retry
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Fire an event: try once inline; on any failure, enqueue for retry.
async function sendEvent(type, data, occurredAt) {
  const payload = {
    eventId: `${type}:${data.uniqueid || data.crmCallId || ''}:${data.status || ''}:${crypto.randomBytes(4).toString('hex')}`,
    type,
    occurredAt: occurredAt || new Date().toISOString(),
    data,
  };
  // Deterministic eventId when we have a natural key (better idempotency).
  if (data.eventId) payload.eventId = data.eventId;
  else if (data.uniqueid && data.status) payload.eventId = `${type}:${data.uniqueid}:${data.status}`;

  try {
    await postOnce(payload);
    logger.debug({ type, correlationId: payload.data.uniqueid }, 'event → CRM ok');
  } catch (err) {
    logger.warn({ type, err: err.message }, 'event → CRM failed, queued for retry');
    queue.enqueue(payload);
  }
}

// Called on an interval by server.js.
async function drainQueue() {
  if (queue.size() === 0) return;
  const r = await queue.drain(postOnce);
  if (r.done || r.failed) logger.info(r, 'crm queue drained');
}

module.exports = { sendEvent, drainQueue, queue };
