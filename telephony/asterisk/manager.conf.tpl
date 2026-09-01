; ─────────────────────────────────────────────────────────────────────────
;  AMI user for the Telephony Integration Service.
;
;  Apply:  copy the [crm] block into /etc/asterisk/manager.conf  (VICIdial
;  ships its own manager.conf — ADD this stanza, do NOT replace the file),
;  then:  asterisk -rx "manager reload"
;
;  SECURITY: AMI stays bound to localhost. The integration service runs on
;  the SAME box, so it never needs to leave 127.0.0.1. Never expose 5038.
; ─────────────────────────────────────────────────────────────────────────

; --- keep / verify these in the [general] section of manager.conf ---
; [general]
; enabled = yes
; port = 5038
; bindaddr = 127.0.0.1        ; <-- localhost ONLY
; displayconnects = no

[crm]
secret = {{AMI_SECRET}}                     ; == AMI_SECRET in /opt/telephony/.env
deny = 0.0.0.0/0.0.0.0
permit = 127.0.0.1/255.255.255.255
read = system,call,cdr,cel,agent,user,dialplan,verbose
write = system,call,originate,agent,dialplan
; 'originate' is required for click-to-call. Nothing wider.
