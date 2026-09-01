# Final Verification Report  (fill after each phase — spec §33)

## SERVER
- OS / Ubuntu version:
- Kernel:
- Hostname:
- Public IP:
- Private IP:
- CPU (cores):
- RAM:
- Disk (free):

## ASTERISK
- Version (expect 22.x):
- Service status:
- res_pjsip loaded:            chan_sip NOT loaded:
- PJSIP transports:
- PJSIP endpoints (incl. 1001–1004):
- PJSIP registrations:
- AMI: user `crm`, bind 127.0.0.1, reachable from service:
- RTP range:
- CDR backend(s):              crm_call_id mapped:
- CEL status:
- Recording (MixMonitor) → dir:

## VICIDIAL
- Installed / version:
- Admin UI reachable (localhost):     public: NO (confirm)
- Agent UI:
- DB name / reachable:
- correlation.sql applied:
- Test campaign / list id:
- Hopper working:
- Dialer (manual) tested:
- Recording in vicidial:
- Transfer tested:
- Realtime agent status:

## CRM
- Frontend URL:
- Backend URL:
- Database (Mongo):
- Auth (JWT bearer):
- CALLING_PROVIDER:            (mock | telephony)
- Telephony API URL set:
- `/api/calling/status` online:

## INTEGRATION SERVICE (VPS)
- systemd `telephony` active:
- `https://telephony.<domain>/healthz` 200:
- HMAC both directions verified:
- Disk queue drains (CRM-down test):
- `/status` → asterisk online, sipOutboundEnabled=false:

## INTEGRATION
- CRM → VICIdial lead upsert:
- VICIdial → CRM call.started:
- ... call.ringing:
- ... call.answered:
- ... call.ended (+duration):
- disposition sync:
- recording.ready → CRM `available`:
- recording plays via CRM proxy (not public):
- transfer.completed → new CRM leg:
- agent.status sync:
- duplicate event → CRM returns `duplicate:true` (no double row):
- failed event replayed from dead-letter:

## SECURITY
- HTTPS on integration API:
- UFW: 22/80/443 only; 5038/3306 denied externally:
- SIP/RTP ports: CLOSED (no provider yet):
- fail2ban: sshd + nginx jails active; asterisk jail = OFF until Phase 20:
- AMI localhost only:
- MySQL localhost only:
- VICIdial admin/agent NOT public:
- `.env` chmod 600, no secrets in git:

## TESTS
- Ext 1001 → 1002:
- Chain 1002 → 1003 → 1004:
- Recording file written:
- Blind transfer:
- DTMF:
- VICIdial agent login:
- CRM Auto Dialer → Dial Next → ext 1002 rings:
- Call events land in CRM Agent Screen / History < 2s:
- CRM lead → VICIdial list row:
- Disposition round-trip:

## SIP PROVIDER STATUS
- SIP Server:            NOT PROVIDED
- SIP Username:          NOT PROVIDED
- SIP Password:          NOT PROVIDED
- SIP Port:              NOT PROVIDED
- Transport:             NOT PROVIDED
- Auth mode:             NOT PROVIDED
- DID / Virtual Number:  NOT PROVIDED
- Outbound Permission:   NOT PROVIDED
- `SIP_OUTBOUND_ENABLED`: false
