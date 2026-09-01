const mysql = require('mysql2/promise');
const config = require('../config');
const { logger } = require('../lib/logger');

// Read/write the LOCAL VICIdial MySQL (127.0.0.1). This connection NEVER
// leaves the VPS and is NEVER proxied to the CRM (spec §27). If
// VICIDIAL_ENABLED=false, every method is a safe no-op so the service and
// internal Asterisk testing still work before VICIdial is verified.

let pool = null;
function getPool() {
  if (!config.vicidial.enabled) return null;
  if (!pool) {
    pool = mysql.createPool({
      ...config.vicidial.db,
      waitForConnections: true,
      connectionLimit: 4,
      maxIdle: 2,
      idleTimeout: 30000,
      namedPlaceholders: true,
    });
  }
  return pool;
}

async function ping() {
  const p = getPool();
  if (!p) return { enabled: false };
  try {
    const [rows] = await p.query('SELECT VERSION() AS v');
    return { enabled: true, ok: true, version: rows[0].v };
  } catch (err) {
    return { enabled: true, ok: false, error: err.message };
  }
}

// Upsert a CRM lead into a VICIdial list. Adds correlation columns
// crm_lead_id / crm_call_id (see vicidial/correlation.sql). Returns the
// vicidial lead_id.
async function upsertLead({ crmLeadId, listId, phone, name, email, company, source }) {
  const p = getPool();
  if (!p) return { enabled: false };
  const [first = '', ...rest] = String(name || '').trim().split(' ');
  const last = rest.join(' ');
  const phoneDigits = String(phone || '').replace(/[^\d]/g, '');

  const [existing] = await p.query(
    'SELECT lead_id FROM vicidial_list WHERE crm_lead_id = :crmLeadId LIMIT 1',
    { crmLeadId }
  );
  if (existing.length) {
    await p.query(
      `UPDATE vicidial_list SET phone_number=:phone, first_name=:first, last_name=:last,
       email=:email, comments=:source, modify_date=NOW() WHERE lead_id=:id`,
      { phone: phoneDigits, first, last, email: email || '', source: source || 'CRM', id: existing[0].lead_id }
    );
    return { enabled: true, leadId: existing[0].lead_id, updated: true };
  }
  const [ins] = await p.query(
    `INSERT INTO vicidial_list
      (entry_date, status, list_id, phone_code, phone_number, first_name, last_name, email, comments, crm_lead_id, source_id)
     VALUES (NOW(), 'NEW', :listId, '91', :phone, :first, :last, :email, :source, :crmLeadId, 'CRM')`,
    { listId, phone: phoneDigits, first, last, email: email || '', source: source || 'CRM', crmLeadId }
  );
  return { enabled: true, leadId: ins.insertId, created: true };
}

// Update a VICIdial lead status/disposition from a CRM event.
async function updateLeadStatus({ vicidialLeadId, status }) {
  const p = getPool();
  if (!p) return { enabled: false };
  await p.query('UPDATE vicidial_list SET status=:status, modify_date=NOW() WHERE lead_id=:id', {
    status,
    id: vicidialLeadId,
  });
  return { enabled: true };
}

// Put a lead into the hopper so the dialer picks it up next.
async function hopperInsert({ vicidialLeadId, campaignId, priority = 50 }) {
  const p = getPool();
  if (!p) return { enabled: false };
  await p.query(
    `INSERT INTO vicidial_hopper (lead_id, campaign_id, status, user, priority, source, gmt_offset_now)
     VALUES (:lead, :camp, 'READY', '', :prio, 'CRM', 5.5)
     ON DUPLICATE KEY UPDATE status='READY', priority=:prio`,
    { lead: vicidialLeadId, camp: campaignId, prio: priority }
  );
  return { enabled: true };
}

// Look up the recording filename VICIdial logged for a call.
async function recordingForUniqueId(uniqueid) {
  const p = getPool();
  if (!p) return null;
  const [rows] = await p.query(
    'SELECT filename, location, length_in_sec FROM recording_log WHERE uniqueid=:u ORDER BY recording_id DESC LIMIT 1',
    { u: uniqueid }
  );
  return rows[0] || null;
}

async function close() {
  if (pool) await pool.end();
  pool = null;
}

module.exports = { getPool, ping, upsertLead, updateLeadStatus, hopperInsert, recordingForUniqueId, close };
