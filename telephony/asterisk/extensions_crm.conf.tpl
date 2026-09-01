; ─────────────────────────────────────────────────────────────────────────
;  Dialplan contexts for the CRM integration.  chan_pjsip.
;
;  Apply:  save as /etc/asterisk/extensions_crm.conf then add ONE line to
;  the bottom of /etc/asterisk/extensions.conf :
;        #include extensions_crm.conf
;  then:  asterisk -rx "dialplan reload"
;
;  Do NOT edit VICIdial's own contexts — these are additive.
; ─────────────────────────────────────────────────────────────────────────

; ===== [crm-internal] — softphones 1001..1004, Phase 6 testing =========
[crm-internal]
exten => _100X,1,NoOp(CRM internal ${EXTEN} from ${CALLERID(all)} crmcall=${CRMCALLID})
 same => n,Set(CDR(crm_call_id)=${CRMCALLID})
 same => n,MixMonitor(${UNIQUEID}.wav,b)          ; recording -> RECORDINGS_DIR
 same => n,Dial(PJSIP/${EXTEN},30,tT)
 same => n,Hangup()

; ===== [crm-outbound] — PSTN via the provider (guarded) ===============
; The integration service only routes here when SIP_OUTBOUND_ENABLED=true
; AND a provider endpoint exists. Until then this context rejects.
[crm-outbound]
exten => _X.,1,NoOp(CRM outbound ${EXTEN} crmcall=${CRMCALLID} did=${CALLERID(num)})
 same => n,GotoIf($["${PJSIP_ENDPOINT(provider,transport)}" = ""]?noprovider)
 same => n,Set(CDR(crm_call_id)=${CRMCALLID})
 same => n,Set(CALLERID(num)=${IF($["${CALLERID(num)}" != ""]?${CALLERID(num)}:{{SIP_DID}})})
 same => n,MixMonitor(${UNIQUEID}.wav,b)
 same => n,Dial(PJSIP/${EXTEN}@provider,45,tT)
 same => n,Hangup()
 same => n(noprovider),NoOp(No SIP provider configured — outbound blocked)
 same => n,Playback(ss-noservice)                 ; optional
 same => n,Hangup(63)

; ===== [crm-transfer] — blind transfer targets =======================
; The service redirects the customer leg here with exten = target
; extension (agent) or a VICIdial ingroup number.
[crm-transfer]
exten => _100X,1,NoOp(CRM transfer -> agent ${EXTEN})
 same => n,Dial(PJSIP/${EXTEN},30,tT)
 same => n,Hangup()
; route named teams to VICIdial ingroups (edit numbers to match VICIdial):
;exten => sales,1,Goto(default,8600001,1)
;exten => support,1,Goto(default,8600002,1)
;exten => finance,1,Goto(default,8600003,1)

; ===== [crm-inbound] — DID pickup (fill after you have the DID) =======
[crm-inbound]
exten => s,1,NoOp(CRM inbound on ${EXTEN})
 same => n,Answer()
 same => n,MixMonitor(in-${UNIQUEID}.wav,b)
 same => n,Goto(default,8300,1)                    ; hand to VICIdial DID entry
;exten => {{SIP_DID}},1,Goto(crm-inbound,s,1)
