#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
#  PHASE 16 — firewall. CONSERVATIVE. Review every line before running.
#  Determine the REAL required ports from phase1-inspect first.
#  Do NOT run blindly — a wrong SSH rule locks you out.
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail
echo "This will (re)configure UFW. Ctrl-C now to abort."; sleep 5

# Keep SSH open FIRST.
ufw allow 22/tcp comment 'ssh'

# HTTPS for the integration API (nginx). HTTP only for certbot renewals.
ufw allow 80/tcp  comment 'http (acme)'
ufw allow 443/tcp comment 'https telephony api'

# ── SIP + RTP: LEAVE CLOSED until the provider is configured ──────────
# When SIP_OUTBOUND_ENABLED=true, open ONLY what the provider requires and
# ideally restrict the source to the provider's signalling IPs:
#
#   PROVIDER_IP=1.2.3.4
#   ufw allow from $PROVIDER_IP to any port 5060 proto udp comment 'sip provider'
#   ufw allow from $PROVIDER_IP to any port 5061 proto tcp comment 'sip tls'
#   ufw allow 10000:20000/udp comment 'rtp media'   # match rtp.conf range
#
# If the provider gives a hostname not an IP, open 5060 to any but keep
# fail2ban's asterisk jail active.

# ── NEVER open these ──────────────────────────────────────────────────
ufw deny 5038/tcp comment 'AMI localhost only'
ufw deny 3306/tcp comment 'mysql localhost only'
ufw deny 3307/tcp

# VICIdial admin/agent web — do NOT expose. If agents connect over the
# internet, put it behind the SAME nginx with TLS + auth, or a VPN, and
# open that explicitly. Otherwise keep 80/443 for the integration vhost
# only and bind VICIdial's apache vhost to 127.0.0.1.

ufw default deny incoming
ufw default allow outgoing
ufw --force enable
ufw status verbose
