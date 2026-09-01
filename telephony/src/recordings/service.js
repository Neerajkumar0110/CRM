const fs = require('fs');
const path = require('path');
const config = require('../config');
const vdb = require('../vicidial/db');

// Locate + stream a recording. The raw directory is NEVER served
// statically — only this function, reached through the CRM's authorised
// proxy (/api/calling/recordings/:id/stream), can open a file, and only
// inside RECORDINGS_DIR (path-traversal guarded).

function safeResolve(reference) {
  // reference may be "callid.wav", "2026/09/01/callid.wav", or a uniqueid.
  const root = path.resolve(config.recordings.dir);
  const clean = String(reference || '').replace(/\.\.(\/|\\|$)/g, '').replace(/^[/\\]+/, '');
  let full = path.resolve(root, clean);
  if (!full.startsWith(root + path.sep) && full !== root) return null;
  if (!/\.(wav|mp3|gsm|ogg)$/i.test(full)) full += '.wav';
  return full;
}

async function resolveFile(reference) {
  let full = safeResolve(reference);
  if (full && fs.existsSync(full)) return full;

  // Fall back: ask VICIdial where it stored the file for this uniqueid.
  const row = await vdb.recordingForUniqueId(reference).catch(() => null);
  if (row && row.filename) {
    full = safeResolve(`${row.location || ''}${row.filename}`);
    if (full && fs.existsSync(full)) return full;
    full = safeResolve(`${row.filename}.wav`);
    if (full && fs.existsSync(full)) return full;
  }
  return null;
}

async function stat(reference) {
  const f = await resolveFile(reference);
  if (!f) return { available: false };
  const s = fs.statSync(f);
  return { available: true, sizeBytes: s.size, mtime: s.mtime, path: f };
}

// Returns { stream, size, contentType } or null.
async function open(reference) {
  const f = await resolveFile(reference);
  if (!f) return null;
  const s = fs.statSync(f);
  const ext = path.extname(f).toLowerCase();
  const ct = ext === '.mp3' ? 'audio/mpeg' : ext === '.ogg' ? 'audio/ogg' : 'audio/wav';
  return { stream: fs.createReadStream(f), size: s.size, contentType: ct };
}

module.exports = { resolveFile, stat, open };
