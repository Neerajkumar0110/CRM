# VICIdial — verify / configure checklist (Phase 4 & 7)

> Use the existing VICIdial install and database. Do **not** create a second
> lead database. These steps only add what the CRM integration needs.

## 4.1 Is VICIdial installed & healthy?
```bash
ls /usr/share/astguiclient/                 # scripts present?
crontab -l | grep -i astguiclient           # keepalive / AST_* cron jobs?
mysql -e "SELECT count(*) FROM asterisk.vicidial_campaigns"   # DB reachable?
curl -sI http://127.0.0.1/vicidial/admin.php | head -1        # web UI up?
systemctl status asterisk --no-pager
```
If any of that is missing, install VICIdial with the **official installer**
against the existing Asterisk 22 — do NOT reinstall Asterisk.

## 4.2 Admin / agent access
- Admin UI: `http://<vps>/vicidial/admin.php`  (behind nginx + basic auth or IP allow — never open the admin UI to the world).
- Agent UI: `http://<vps>/agc/vicidial.php`
- Create/verify a **phone** entry per internal extension (1001..1004) and a **user** per real agent. The user's `phone_login` must match the PJSIP extension the integration service maps in `AGENT_EXTENSIONS`.

## 4.3 API user for the integration service
Admin → Users → new user, e.g. `crmapi`:
- `user_level = 9`, `agent_choose_ingroups = 1`
- API access: set **"API"** = 1 and **"Agent API"** = 1
- Put the same creds in `/opt/telephony/.env` → `VICIDIAL_API_USER` / `VICIDIAL_API_PASS`
- Then set `VICIDIAL_ENABLED=true` and restart the service.

## 4.4 Correlation columns
```bash
mysqldump asterisk > /opt/telephony/backups/asterisk_pre_crm_$(date +%F).sql
mysql asterisk < /opt/telephony/vicidial/correlation.sql
```

## 4.5 A test outbound campaign (no PSTN yet)
Admin → Campaigns → Add:
- `campaign_id` e.g. `CRMTEST`, `dial_method = MANUAL` (safe until SIP is live)
- Recording: `ALLCALLS` or `ALLFORCE`
- Attach a **list** (e.g. `999`) — the integration `/lead/upsert` writes here (`VICIDIAL_DB_NAME.vicidial_list`, `list_id = 999`).
- Dispositions: mirror the CRM ones (SALE, CALLBACK, NI, DNC, NA, B, …) so `call.ended` events line up.
- Carrier / dial route: **leave default** — do NOT attach the SIP carrier until Phase 20.

## 4.6 Inbound (later, after DID)
Admin → Inbound → DIDs: map `{{SIP_DID}}` → an in-group. The Asterisk side is
the `[crm-inbound]` context in `extensions_crm.conf.tpl`.

## 7. Internal test matrix (no PSTN)
| Test | How | Pass = |
|---|---|---|
| Registration | softphones 1001–1004 register | `pjsip show aors` shows contacts |
| 1001→1002 | call from softphone | rings, answers, 2-way audio |
| Chain 1002→1003→1004 | attended | all bridge, audio ok |
| Recording | after a call | `.wav` in `/var/spool/asterisk/monitor` |
| CDR | `SELECT * FROM asterisk.vicidial_log ORDER BY call_date DESC LIMIT 3` | row with correct `uniqueid` |
| CEL | `asterisk -rx "cel show status"` | events flowing |
| Transfer | `[crm-transfer]` blind to 1003 | customer leg moves, event `transfer.completed` |
| DTMF | dial digits during call | `asterisk -rx "core set debug 1"` shows RFC4733 |
| CRM originate | `POST /originate` (via CRM Auto Dialer → Dial Next) to `1002` | agent phone rings, `call.*` events land in CRM |
| Event dedupe | replay the same webhook to the CRM | 2nd call returns `duplicate:true`, no double row |
