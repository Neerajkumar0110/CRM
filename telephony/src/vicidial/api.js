const config = require('../config');
const { logger } = require('../lib/logger');

// Thin client for VICIdial's HTTP APIs (localhost only):
//   non_agent_api.php  — admin: add_lead, update_lead, campaign control,
//                        recording_lookup, agent_status ...
//   agc/api.php        — agent: external_dial, external_hangup, ...
// Docs: https://vicidial.org/docs/  (astguiclient AGENT_API / NON-AGENT_API)
//
// All calls are best-effort: if VICIDIAL_ENABLED=false they no-op.

function form(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function nonAgent(fn, params = {}) {
  if (!config.vicidial.enabled) return { enabled: false };
  const url = `${config.vicidial.apiBase}/non_agent_api.php`;
  const body = form({
    source: 'CRM',
    user: config.vicidial.apiUser,
    pass: config.vicidial.apiPass,
    function: fn,
    ...params,
  });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    // VICIdial replies plain text: "SUCCESS: ..." or "ERROR: ..."
    const ok = /^SUCCESS/i.test(text.trim());
    return { enabled: true, ok, raw: text.trim() };
  } catch (err) {
    logger.warn({ fn, err: err.message }, 'vicidial non_agent_api error');
    return { enabled: true, ok: false, error: err.message };
  }
}

module.exports = {
  addLead: (p) => nonAgent('add_lead', p),
  updateLead: (p) => nonAgent('update_lead', p),
  recordingLookup: (p) => nonAgent('recording_lookup', p),
  agentStatus: (p) => nonAgent('agent_status', p),
  pauseCampaign: (campaign_id) => nonAgent('update_campaign', { campaign_id, active: 'N' }),
  activateCampaign: (campaign_id) => nonAgent('update_campaign', { campaign_id, active: 'Y' }),
  nonAgent,
};
