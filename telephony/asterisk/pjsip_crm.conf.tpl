; ─────────────────────────────────────────────────────────────────────────
;  PJSIP — CRM internal test endpoints + transports.  chan_pjsip ONLY.
;
;  Apply:  save as  /etc/asterisk/pjsip_crm.conf  then add ONE line to the
;  bottom of /etc/asterisk/pjsip.conf :
;        #include pjsip_crm.conf
;  then:  asterisk -rx "pjsip reload"
;
;  Do NOT edit VICIdial-managed pjsip.conf blocks. This file only ADDS.
;  Nothing here touches the SIP provider — that lives in
;  pjsip_provider.conf.tpl and is filled in LATER.
; ─────────────────────────────────────────────────────────────────────────

; ===== TRANSPORTS =======================================================
; Enable only what you actually use. Provider transport is separate.

[transport-udp]
type = transport
protocol = udp
bind = 0.0.0.0:5060
; external_media_address = {{PUBLIC_IP}}     ; uncomment if behind NAT
; external_signaling_address = {{PUBLIC_IP}}
; local_net = {{PRIVATE_CIDR}}               ; e.g. 10.0.0.0/8

;[transport-tcp]
;type = transport
;protocol = tcp
;bind = 0.0.0.0:5060

;[transport-tls]
;type = transport
;protocol = tls
;bind = 0.0.0.0:5061
;cert_file = /etc/asterisk/keys/asterisk.pem
;priv_key_file = /etc/asterisk/keys/asterisk.key
;method = tlsv1_2

; ===== INTERNAL TEST EXTENSIONS 1001–1004 ==============================
; Register 4 softphones (Zoiper / MicroSIP / Linphone) to these to run the
; Phase 6 tests (1001→1002→1003→1004) with NO PSTN.

[crm-endpoint-template](!)
type = endpoint
context = crm-internal
disallow = all
allow = ulaw,alaw
direct_media = no
rtp_symmetric = yes
force_rport = yes
rewrite_contact = yes
dtmf_mode = rfc4733
send_pai = yes

[crm-auth-template](!)
type = auth
auth_type = userpass

[crm-aor-template](!)
type = aor
max_contacts = 2
remove_existing = yes
qualify_frequency = 30

; ---- 1001 ----
[1001](crm-endpoint-template)
auth = 1001
aors = 1001
callerid = Agent 1001 <1001>
[1001](crm-auth-template)
username = 1001
password = {{EXT_1001_PASSWORD}}
[1001](crm-aor-template)

; ---- 1002 ----
[1002](crm-endpoint-template)
auth = 1002
aors = 1002
callerid = Agent 1002 <1002>
[1002](crm-auth-template)
username = 1002
password = {{EXT_1002_PASSWORD}}
[1002](crm-aor-template)

; ---- 1003 ----
[1003](crm-endpoint-template)
auth = 1003
aors = 1003
callerid = Agent 1003 <1003>
[1003](crm-auth-template)
username = 1003
password = {{EXT_1003_PASSWORD}}
[1003](crm-aor-template)

; ---- 1004 ----
[1004](crm-endpoint-template)
auth = 1004
aors = 1004
callerid = Agent 1004 <1004>
[1004](crm-auth-template)
username = 1004
password = {{EXT_1004_PASSWORD}}
[1004](crm-aor-template)

; ===== SIP PROVIDER TRUNK ==============================================
; Filled in LATER — keep this include, edit only pjsip_provider.conf.
#include pjsip_provider.conf
