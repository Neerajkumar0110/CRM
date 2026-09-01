-- ─────────────────────────────────────────────────────────────────────────
--  VICIdial carrier for the SIP provider.  DO NOT RUN until you have SIP
--  credentials. Fill {{...}} then load against the VICIdial DB.
--
--  This tells VICIdial (a) how to place outbound calls onto the provider
--  trunk and (b) — for register mode — what registration string Asterisk
--  needs. The Asterisk side is pjsip_provider.conf.tpl.
-- ─────────────────────────────────────────────────────────────────────────

-- The server_ip must match your VICIdial 'server_id' / server row.
SET @server_ip = '{{VICIDIAL_SERVER_IP}}';   -- e.g. 127.0.0.1 for a single-box install

INSERT INTO vicidial_server_carriers
  (server_ip, carrier_id, carrier_name, carrier_description, registration_string,
   template_id, globals_string, dialplan_entry, protocol, active)
VALUES
  (@server_ip,
   '{{CARRIER_ID}}',                    -- short code, e.g. MYPROVIDER
   '{{CARRIER_NAME}}',                  -- human name
   'Added by CRM telephony integration',
   -- REGISTER mode only (leave blank for IP auth):
   '{{SIP_USERNAME}}:{{SIP_PASSWORD}}@{{SIP_SERVER}}:{{SIP_PORT}}/{{SIP_USERNAME}}',
   NULL,
   -- GLOBALS: how the dialplan reaches the trunk. PJSIP endpoint name = provider
   'PROVIDER_TRUNK => PJSIP/provider',
   -- DIALPLAN: what VICIdial appends to its outbound context. ${EXTEN} is
   -- the customer number VICIdial dials. Add prefix/CID rules per provider.
   'exten => _91NXXXXXXXXX,1,AGI(agi://127.0.0.1:4577/call_log)\n'
   'exten => _91NXXXXXXXXX,n,Dial(${PROVIDER_TRUNK}/${EXTEN:0},,tor)\n'
   'exten => _91NXXXXXXXXX,n,Hangup()',
   'PJSIP',
   'Y');

-- After loading:  Admin → Servers → (your server) → "Modify Server" →
-- click "SUBMIT" once so VICIdial regenerates /etc/asterisk/*_vicidial.conf,
-- then:  /usr/share/astguiclient/ADMIN_keepalive_ALL.pl --debug   (or reboot Asterisk)
