const express = require('express');
const config = require('../config');
const ami = require('../asterisk/ami');
const { trackOrigination } = require('../asterisk/events');
const vdb = require('../vicidial/db');
const vapi = require('../vicidial/api');
const recordings = require('../recordings/service');
const { logger, newId } = require('../lib/logger');

// CRM → VPS API. Every request is HMAC-verified by the middleware in
// server.js. Responses are plain JSON the CRM's TelephonyProvider maps
// back onto CallingProvider results.
const router = express.Router();

const digits = (s) => String(s || '').replace(/[^\d+]/g, '');
const isInternal = (n) => /^\d{3,5}$/.test(String(n)) && Number(n) < 100000 && String(n).length <= 5;

function resolveAgentExtension(agentRef) {
  if (!agentRef) return null;
  if (config.agentExtensions[agentRef]) return String(config.agentExtensions[agentRef]);
  if (/^\d{3,5}$/.test(String(agentRef))) return String(agentRef);
  return null;
}

// ── GET /status ────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  const amiState = await ami.status();
  let version = null;
  try {
    version = amiState.loggedIn ? await ami.coreShowVersion() : null;
  } catch (e) {
    /* ignore */
  }
  const vici = config.vicidial.enabled ? await vdb.ping() : { enabled: false };
  return res.json({
    ok: true,
    online: amiState.loggedIn,
    sipOutboundEnabled: !!config.sip.outboundEnabled,
    sipInboundEnabled: !!config.sip.inboundEnabled,
    asterisk: { version, ami: amiState },
    vicidial: vici,
    ready: config.ready,
  });
});

// ── POST /originate ───────────────────────────────────────────────────
router.post('/originate', async (req, res) => {
  const rid = newId('orig');
  const { crmCallId, phone, callerId, agentRef, campaignId, vicidialLeadId } = req.body || {};
  if (!crmCallId || !phone) return res.status(400).json({ ok: false, error: 'crmCallId and phone are required' });

  const ext = resolveAgentExtension(agentRef);
  if (!ext) {
    return res.status(400).json({
      ok: false,
      error: `No SIP extension mapped for agent "${agentRef}". Set AGENT_EXTENSIONS in the VPS .env.`,
      code: 'agent_unmapped',
    });
  }

  const dest = digits(phone);
  const internal = isInternal(dest);
  if (!internal && !config.sip.outboundEnabled) {
    return res.status(409).json({
      ok: false,
      error: 'Outbound PSTN calling is disabled (no SIP provider configured yet). Internal extension calls still work.',
      code: 'outbound_disabled',
    });
  }
  if (!ami.loggedIn) {
    return res.status(503).json({ ok: false, error: 'Asterisk AMI is not connected.', code: 'ami_down' });
  }

  const agentChannel = config.ami.agentChannelTemplate.replace('{ext}', ext);
  const context = internal ? config.ami.internalContext : config.ami.outboundContext;

  try {
    const r = await ami.originateToAgent({
      agentChannel,
      exten: dest,
      context,
      callerId: callerId || config.sip.did || '',
      variables: {
        CRMCALLID: crmCallId,
        CRMCAMPAIGNID: campaignId || '',
        CRMAGENTEXT: ext,
        VICIDIALLEADID: vicidialLeadId || '',
      },
    });
    // Async originate returns immediately; Uniqueid arrives on the channel
    // events. Some Asterisk builds echo it in the response.
    const uniqueid = r.Uniqueid || r.ActionID || null;
    if (uniqueid) trackOrigination(uniqueid, crmCallId);
    logger.info({ rid, crmCallId, ext, dest, internal }, 'originate accepted');
    return res.json({ ok: true, uniqueid, providerCallId: uniqueid || crmCallId, internal });
  } catch (err) {
    logger.error({ rid, err: err.message }, 'originate failed');
    return res.status(502).json({ ok: false, error: `Asterisk Originate failed: ${err.message}` });
  }
});

// ── in-call actions (need the live channel) ───────────────────────────
async function channelForCall(id) {
  // id is crmCallId or uniqueid; look through tracked calls
  const { calls } = require('../asterisk/events');
  for (const [uniqueid, info] of calls) {
    if (uniqueid === id || info.crmCallId === id) return { uniqueid, channel: info.channel };
  }
  return null;
}

router.post('/call/:id/hangup', async (req, res) => {
  const ch = await channelForCall(req.params.id);
  if (!ch || !ch.channel) return res.json({ ok: true, note: 'no live channel (already ended)' });
  try {
    await ami.hangup(ch.channel);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message });
  }
});

router.post('/call/:id/mute', async (req, res) => {
  const ch = await channelForCall(req.params.id);
  if (!ch || !ch.channel) return res.status(409).json({ ok: false, error: 'no live channel' });
  try {
    await ami.action({
      Action: 'MuteAudio',
      Channel: ch.channel,
      Direction: 'in',
      State: req.body.on ? 'on' : 'off',
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message });
  }
});

router.post('/call/:id/hold', async (req, res) => {
  // Real hold is best driven from the agent's softphone. We acknowledge so
  // the CRM UI stays consistent; a future dialplan feature can do MOH.
  return res.json({ ok: true, note: 'hold acknowledged (use the softphone hold for MOH)' });
});

router.post('/call/:id/transfer', async (req, res) => {
  const ch = await channelForCall(req.params.id);
  if (!ch || !ch.channel) return res.status(409).json({ ok: false, error: 'no live channel to transfer' });
  const target = digits(req.body.toAgentRef) || resolveAgentExtension(req.body.toAgentRef) || String(req.body.target || '');
  if (!target) return res.status(400).json({ ok: false, error: 'transfer target is required' });
  try {
    // Blind transfer: redirect the customer leg into the transfer context.
    await ami.redirect({
      channel: ch.channel,
      context: config.ami.transferContext,
      exten: target,
      priority: 1,
    });
    return res.json({ ok: true, target });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message });
  }
});

// ── campaign control ─────────────────────────────────────────────────
router.post('/campaigns/:id/start', async (req, res) => {
  const r = await vapi.activateCampaign(req.body.vicidialCampaignId || req.params.id);
  return res.json({ ok: r.ok !== false, vicidial: r });
});
router.post('/campaigns/:id/pause', async (req, res) => {
  const r = await vapi.pauseCampaign(req.body.vicidialCampaignId || req.params.id);
  return res.json({ ok: r.ok !== false, vicidial: r });
});
router.post('/campaigns/:id/stop', async (req, res) => {
  const r = await vapi.pauseCampaign(req.body.vicidialCampaignId || req.params.id);
  return res.json({ ok: r.ok !== false, vicidial: r });
});

// ── lead sync (CRM → VICIdial) ───────────────────────────────────────
router.post('/lead/upsert', async (req, res) => {
  const { crmLeadId, listId, phone, name, email, company, source, campaignId, pushToHopper } = req.body || {};
  if (!crmLeadId || !phone) return res.status(400).json({ ok: false, error: 'crmLeadId and phone required' });
  const r = await vdb.upsertLead({ crmLeadId, listId, phone, name, email, company, source });
  if (r.enabled && r.leadId && pushToHopper && campaignId) {
    await vdb.hopperInsert({ vicidialLeadId: r.leadId, campaignId }).catch(() => {});
  }
  return res.json({ ok: true, vicidialLeadId: r.leadId, vicidial: r });
});

// ── recording stream (called by the CRM's authorised proxy only) ──────
router.get('/recordings/:reference', async (req, res) => {
  const opened = await recordings.open(decodeURIComponent(req.params.reference));
  if (!opened) return res.status(404).json({ ok: false, error: 'recording not found' });
  res.setHeader('content-type', opened.contentType);
  res.setHeader('content-length', opened.size);
  opened.stream.on('error', () => res.destroy());
  opened.stream.pipe(res);
});

module.exports = router;
