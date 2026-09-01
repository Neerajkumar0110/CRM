const crypto = require('crypto');

// IDENTICAL scheme to backend/src/services/calling/httpSign.js — the two
// sides MUST agree byte-for-byte. Kept as a standalone copy so this
// service has no cross-package import.
//
//   signature = HMAC_SHA256( `${timestamp}.${nonce}.${rawBody}`, secret )

function sign({ secret, timestamp, nonce, rawBody }) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${nonce}.${rawBody}`).digest('hex');
}

function buildHeaders({ apiKey, secret, body }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body || {});
  return {
    headers: {
      'content-type': 'application/json',
      'x-telephony-key': apiKey,
      'x-telephony-timestamp': String(timestamp),
      'x-telephony-nonce': nonce,
      'x-telephony-signature': sign({ secret, timestamp, nonce, rawBody }),
    },
    rawBody,
  };
}

function verify({ apiKey, secret, toleranceSec = 300, headers, rawBody }) {
  const key = headers['x-telephony-key'];
  const ts = Number(headers['x-telephony-timestamp']);
  const nonce = headers['x-telephony-nonce'];
  const sigHeader = headers['x-telephony-signature'];

  if (!key || !ts || !nonce || !sigHeader) return { ok: false, reason: 'missing_signature_headers' };
  if (apiKey && key !== apiKey) return { ok: false, reason: 'bad_api_key' };
  const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (!Number.isFinite(ts) || skew > toleranceSec) return { ok: false, reason: 'timestamp_out_of_window' };

  const expected = sign({ secret, timestamp: ts, nonce, rawBody: rawBody || '' });
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sigHeader));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' };
  return { ok: true, nonce, timestamp: ts };
}

module.exports = { sign, buildHeaders, verify };
