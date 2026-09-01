; ═════════════════════════════════════════════════════════════════════════
;  SIP PROVIDER TRUNK  —  THE ONLY FILE YOU EDIT WHEN CREDENTIALS ARRIVE.
;
;  Until then: leave everything commented. Internal 1001–1004 testing works
;  without it. The integration service keeps SIP_OUTBOUND_ENABLED=false so
;  the CRM shows "outbound disabled" instead of failing.
;
;  When the provider sends details, ASK / CONFIRM (do NOT assume):
;    • REGISTER  or  IP-authentication ?
;    • transport: udp / tcp / tls ?      • SIP port ?
;    • codecs (ulaw/alaw/g729…) ?        • NAT / media requirements ?
;    • outbound caller-ID rules ?        • DID for inbound ?
;
;  Fill placeholders, uncomment the ONE matching block, then:
;    asterisk -rx "pjsip reload"
;    asterisk -rx "pjsip show registrations"   (register mode)
;    asterisk -rx "pjsip show endpoint provider"
;
;  Also update /opt/telephony/.env:
;    SIP_SERVER=  SIP_USERNAME=  SIP_PASSWORD=  SIP_PORT=  SIP_TRANSPORT=
;    SIP_AUTH_MODE=  SIP_DID=  SIP_CODECS=  SIP_OUTBOUND_ENABLED=true
;  and add the VICIdial carrier (see ../vicidial/carrier.sql.tpl).
; ═════════════════════════════════════════════════════════════════════════

; ---------- transport for the trunk (pick one; may reuse transport-udp) ----------
;[transport-provider]
;type = transport
;protocol = {{SIP_TRANSPORT}}          ; udp | tcp | tls
;bind = 0.0.0.0:0

; ═══════ OPTION A — REGISTRATION-BASED (username/password) ═══════════════
;[provider]
;type = registration
;transport = transport-udp
;outbound_auth = provider-auth
;server_uri = sip:{{SIP_SERVER}}:{{SIP_PORT}}
;client_uri = sip:{{SIP_USERNAME}}@{{SIP_SERVER}}:{{SIP_PORT}}
;retry_interval = 60
;forbidden_retry_interval = 300
;expiration = 3600
;line = yes
;endpoint = provider
;
;[provider-auth]
;type = auth
;auth_type = userpass
;username = {{SIP_USERNAME}}
;password = {{SIP_PASSWORD}}
;
;[provider-aor]
;type = aor
;contact = sip:{{SIP_SERVER}}:{{SIP_PORT}}
;qualify_frequency = 60
;
;[provider]
;type = endpoint
;transport = transport-udp
;context = crm-inbound
;disallow = all
;allow = {{SIP_CODECS}}                 ; e.g. ulaw,alaw
;outbound_auth = provider-auth
;aors = provider-aor
;from_user = {{SIP_USERNAME}}
;from_domain = {{SIP_SERVER}}
;rtp_symmetric = yes
;force_rport = yes
;direct_media = no
;;send_rpid = yes
;;trust_id_outbound = yes
;
;[provider-identify]
;type = identify
;endpoint = provider
;match = {{SIP_SERVER}}                  ; provider signalling IP/host

; ═══════ OPTION B — IP AUTHENTICATION (no register) ════════════════════
;[provider]
;type = endpoint
;transport = transport-udp
;context = crm-inbound
;disallow = all
;allow = {{SIP_CODECS}}
;aors = provider-aor
;from_user = {{SIP_DID}}
;from_domain = {{SIP_SERVER}}
;rtp_symmetric = yes
;force_rport = yes
;direct_media = no
;
;[provider-aor]
;type = aor
;contact = sip:{{SIP_SERVER}}:{{SIP_PORT}}
;
;[provider-identify]
;type = identify
;endpoint = provider
;match = {{SIP_SERVER}}                  ; the provider's signalling IP(s)

; ═══════ INBOUND DID ROUTE (fill after you have the DID) ═══════════════
; In extensions_crm.conf add a [crm-inbound] entry that matches {{SIP_DID}}
; and sends the call to your VICIdial inbound DID / ingroup, e.g.:
;   exten => {{SIP_DID}},1,Goto(default,8300,1)   ; VICIdial DID pickup
