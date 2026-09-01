; ADD/verify in /etc/asterisk/rtp.conf  ([general] section). VICIdial sets
; a range already — only widen/confirm, then: asterisk -rx "module reload res_rtp_asterisk.so"
;
; The RTP UDP range is the ONLY large port range the firewall opens, and
; ONLY when a SIP provider needs media through. Keep it tight.

[general]
rtpstart = 10000
rtpend   = 20000
; strictrtp = yes
; icesupport = no                 ; leave off unless WebRTC
; stunaddr =                      ; set only if provider requires STUN
