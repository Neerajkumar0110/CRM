# CRM ⇄ VICIdial/Asterisk — Telephony Integration

This folder is the **VPS-side** of the integration. It is the *only* thing
the CRM backend talks to. It bridges:

```
CRM Frontend (Vercel)
   └─HTTPS─▶ CRM Backend (Vercel)
                └─signed HTTPS─▶ THIS SERVICE (VPS :4000 behind nginx :443)
                                     ├─AMI (127.0.0.1:5038)──▶ Asterisk 22
                                     └─MySQL (127.0.0.1:3306)─▶ VICIdial
                                                                   └─ SIP provider (LATER) ─▶ PSTN
```

Nothing here assumes a SIP provider. Internal extension testing works now;
when credentials arrive you edit **one file** (`asterisk/pjsip_provider.conf`)
+ a few `.env` values + one VICIdial carrier row.

---

## What lives where

| Path | Purpose |
|---|---|
| `src/server.js` | Express app, HMAC gate, AMI boot, queue drain |
| `src/config/` | all env, incl. SIP placeholders |
| `src/lib/hmac.js` | request signing — **byte-identical** to `backend/src/services/calling/httpSign.js` |
| `src/lib/diskQueue.js` | durable queue so events survive CRM downtime |
| `src/crm/client.js` | VPS → CRM webhook sender (+ retry) |
| `src/asterisk/ami.js` | minimal AMI client (no external dep), reconnecting |
| `src/asterisk/events.js` | AMI events → normalised CRM events |
| `src/vicidial/db.js` / `api.js` | local VICIdial MySQL + non_agent_api |
| `src/recordings/service.js` | path-guarded file access; streamed only via the CRM proxy |
| `src/api/routes.js` | CRM → VPS endpoints (`/originate`, `/call/:id/*`, `/lead/upsert`, `/recordings/:ref`, `/status`) |
| `asterisk/*.tpl` | provider-independent PJSIP / dialplan / manager / rtp templates |
| `vicidial/*.sql` `*.md` | correlation columns, carrier template, setup checklist |
| `deploy/` | inspect, backup, install, systemd, nginx, ufw, fail2ban |

---

## Phase-by-phase

> **Rule:** inspect → back up → change one thing → verify → next. Never
> overwrite VICIdial-managed config; only `#include` additive files.

### PHASE 0 — Re-image + VICIdial  ← START HERE (chosen path)
The VPS was Ubuntu 26.04 + `apt install asterisk`, which **cannot run
VICIdial**. Re-image to Ubuntu 22.04 LTS and run the VICIdial installer:
see **`deploy/PHASE0-reimage-and-vicidial.md`**. After VICIdial is verified,
continue below.

### PHASE 1 — Inspect (read-only)
```bash
scp -r telephony/ root@VPS:/opt/telephony      # or git clone on the VPS
sudo bash /opt/telephony/deploy/phase1-inspect.sh | tee /root/phase1-report.txt
```
Read the report. Confirm: `res_pjsip` loaded, `chan_sip` **not** loaded,
AMI + MySQL on `127.0.0.1` only, VICIdial present, free disk for backups.

### PHASE 2 — Backup
```bash
sudo bash /opt/telephony/deploy/phase2-backup.sh asterisk
```
Backups → `/opt/telephony/backups/<ts>/`. Verify the DB dump opens.

### PHASE 3 — Verify Asterisk
```bash
asterisk -rx "core show version"      # expect 22.x
asterisk -rx "pjsip show transports"
asterisk -rx "module show like chan_sip"   # must be empty
```
If `chan_sip` is loaded: `echo "noload => chan_sip.so" >> /etc/asterisk/modules.conf` then `module unload chan_sip.so`.

### PHASE 4 — Verify / install VICIdial
Follow `vicidial/setup-notes.md` §4.1–4.4. Then:
```bash
mysql asterisk < /opt/telephony/vicidial/correlation.sql
```

### PHASE 5 — Internal extensions
```bash
cp /opt/telephony/asterisk/pjsip_crm.conf.tpl        /etc/asterisk/pjsip_crm.conf
cp /opt/telephony/asterisk/pjsip_provider.conf.tpl   /etc/asterisk/pjsip_provider.conf
cp /opt/telephony/asterisk/extensions_crm.conf.tpl   /etc/asterisk/extensions_crm.conf
cp /opt/telephony/asterisk/manager.conf.tpl          /root/manager_crm_stanza.conf
# edit the {{...}} placeholders (ext passwords, AMI secret, PUBLIC_IP)
echo '#include pjsip_crm.conf'      >> /etc/asterisk/pjsip.conf
echo '#include extensions_crm.conf' >> /etc/asterisk/extensions.conf
# add the [crm] stanza from manager_crm_stanza.conf into /etc/asterisk/manager.conf
asterisk -rx "pjsip reload"; asterisk -rx "dialplan reload"; asterisk -rx "manager reload"
```

### PHASE 6 — Internal Asterisk testing (NO PSTN)
Register softphones to 1001–1004. Run the matrix in
`vicidial/setup-notes.md` §7 (call, ring, answer, hangup, caller-ID, CDR,
recording, transfer, DTMF).

### PHASE 7 — VICIdial testing
Agent login, manual dial to `1002`, disposition, recording, realtime status,
call log. Still no PSTN.

### PHASE 8 — Install this service
```bash
sudo bash /opt/telephony/deploy/install.sh
cd /opt/telephony && npm run gen-secrets   # paste into .env
nano /opt/telephony/.env                    # AMI_SECRET, CRM_*, WEBHOOK_*, DB, AGENT_EXTENSIONS
sudo systemctl start telephony
curl -s http://127.0.0.1:4000/healthz
```

### PHASE 9 — HTTPS
```bash
cp deploy/nginx/telephony.conf /etc/nginx/sites-available/
ln -s /etc/nginx/sites-available/telephony.conf /etc/nginx/sites-enabled/
# add:  limit_req_zone $binary_remote_addr zone=telephony_api:10m rate=20r/s;  to nginx.conf http{}
certbot --nginx -d telephony.yourdomain.com
nginx -t && systemctl reload nginx
curl -s https://telephony.yourdomain.com/healthz
```

### PHASE 10 — Connect the CRM backend
On Vercel (CRM backend env), set and redeploy:
```
CALLING_PROVIDER=telephony
TELEPHONY_API_URL=https://telephony.yourdomain.com
TELEPHONY_API_KEY=<same as VPS CRM_API_KEY>
TELEPHONY_HMAC_SECRET=<same as VPS CRM_HMAC_SECRET>
TELEPHONY_WEBHOOK_KEY=<same as VPS WEBHOOK_API_KEY>
TELEPHONY_WEBHOOK_HMAC_SECRET=<same as VPS WEBHOOK_HMAC_SECRET>
```
Verify: CRM → **Calls** tab shows *"VICIdial (Asterisk) · SIP outbound disabled"*
(green means the CRM reached the VPS). `GET /api/calling/status` → `online:true`.

### PHASE 11–12 — CRM ⇄ VICIdial sync
- CRM → VPS: adding a lead to a campaign in the CRM calls `POST /lead/upsert`
  (wire this in the CRM's campaign controller if you want auto-push; the
  endpoint is ready).
- VPS → CRM: `src/asterisk/events.js` already forwards `call.started/ringing/
  answered/ended/recording.ready/transfer.completed/agent.status`. The CRM
  ingests them idempotently (`TelephonyEvent` model, dedupe, dead-letter,
  replay).
- **Test:** CRM Auto Dialer → pick campaign → *Dial Next* to extension `1002`.
  The 1002 softphone rings; `call.*` events appear on the CRM Agent Screen /
  Call History within ~2s.

### PHASE 13 — Recording sync
After an internal test call, `recording.ready` sets the CRM record's
`recording.status = available` + `reference`. Play it in the CRM Recordings
tab → the CRM proxies `GET /recordings/:ref` from the VPS (authorised,
never public).

### PHASE 14 — Transfer sync
Agent Screen → Transfer → agent `1003` (or a team). VPS `Redirect`s the
customer leg into `[crm-transfer]`; `transfer.completed` creates the new
CRM leg.

### PHASE 15 — Frontend
Already done — the CRM frontend only ever calls `/api/calling/*` and
`/api/calling/recordings/:id/stream`. No frontend change needed to switch
providers.

### PHASE 16 — Hardening
```bash
sudo bash /opt/telephony/deploy/ufw-rules.sh          # review first!
cp /opt/telephony/deploy/fail2ban/jail-telephony.local /etc/fail2ban/jail.d/
systemctl restart fail2ban
```
Checklist: AMI 5038 denied externally · MySQL 3306 denied externally ·
VICIdial admin/agent vhost NOT public (bind 127.0.0.1 or IP-allow) ·
`.env` is `chmod 600` · secrets only in env, none in git.

### PHASE 17 — Full internal test
Run every row of `vicidial/setup-notes.md` §7 **through the CRM UI**:
lead sync, agent login, internal call, status, recording, CDR, disposition,
transfer, event sync, **duplicate-event prevention** (replay a webhook →
CRM returns `duplicate:true`).

### PHASE 18–19 — SIP placeholders / wait
Everything above works with `SIP_OUTBOUND_ENABLED=false`. Stop here until
the provider sends credentials.

### PHASE 20 — When SIP credentials arrive
1. Fill `asterisk/pjsip_provider.conf` — uncomment Option A (register) **or**
   Option B (IP auth) per the provider; set transport/port/codecs/NAT as they
   specify. `asterisk -rx "pjsip reload"`.
2. `asterisk -rx "pjsip show registrations"` → `Registered` (register mode).
3. VICIdial: load `vicidial/carrier.sql.tpl` (filled), then Admin → Servers →
   SUBMIT to regenerate `*_vicidial.conf`.
4. Set in **VPS `.env`**: `SIP_SERVER/USERNAME/PASSWORD/PORT/TRANSPORT/
   AUTH_MODE/DID/CODECS` and `SIP_OUTBOUND_ENABLED=true`; `systemctl restart telephony`.
5. Firewall: open only the provider's SIP + RTP (restrict source IP if given).
   Enable the `asterisk` fail2ban jail with the provider IP in `ignoreip`.
6. One supervised test call to a known mobile. Check audio both ways,
   caller-ID, CDR, recording, CRM Call History. Then go live.

**No CRM / VICIdial / Asterisk rebuild. Provider layer only.**

---

## Security summary
- CRM ⇄ VPS: HTTPS + shared API key + HMAC-SHA256(`ts.nonce.body`) +
  ±300s window + single-use nonce (replay-guarded both directions).
- AMI + MySQL: `127.0.0.1` only, firewalled, never proxied.
- Recordings: no public path; only the authorised CRM proxy can fetch,
  after a per-user permission check.
- Secrets: env only (`.env` `chmod 600`, not committed).
- Frontend: talks to the CRM backend only — never Asterisk/AMI/MySQL/SIP.
