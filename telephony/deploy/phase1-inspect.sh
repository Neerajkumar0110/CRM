#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
#  PHASE 1 — READ-ONLY server inspection. Changes NOTHING.
#  Run on the telephony VPS:   sudo bash phase1-inspect.sh | tee /root/phase1-report.txt
# ─────────────────────────────────────────────────────────────────────────
set -uo pipefail
sec() { printf '\n══════════ %s ══════════\n' "$1"; }
run() { printf '\n$ %s\n' "$*"; "$@" 2>&1 | sed 's/^/    /'; }

sec "OS / HOST / HARDWARE"
run hostnamectl
run lsb_release -a
run uname -a
run bash -c 'echo "public IP: $(curl -s --max-time 5 ifconfig.me || echo unknown)"'
run bash -c 'ip -4 addr show | grep -E "inet " | sed "s/^ *//"'
run nproc
run bash -c 'free -h'
run bash -c 'df -h /'
run bash -c 'uptime'

sec "ASTERISK"
run bash -c 'which asterisk && asterisk -V'
run systemctl is-active asterisk
run systemctl status asterisk --no-pager -l
run asterisk -rx "core show version"
run asterisk -rx "core show uptime"
run asterisk -rx "module show like res_pjsip"
run asterisk -rx "module show like chan_sip"      # should be NOT loaded
run asterisk -rx "pjsip show transports"
run asterisk -rx "pjsip show endpoints"
run asterisk -rx "pjsip show aors"
run asterisk -rx "pjsip show registrations"
run asterisk -rx "manager show settings"
run asterisk -rx "cdr show status"
run asterisk -rx "cel show status"
run asterisk -rx "module show like mixmonitor"
run bash -c 'ls -la /etc/asterisk/ | head -60'
run bash -c 'grep -RIl "" /etc/asterisk/*.conf 2>/dev/null | wc -l'

sec "VICIDIAL"
run bash -c 'ls -d /usr/share/astguiclient 2>/dev/null && ls /usr/share/astguiclient | head'
run bash -c 'crontab -l 2>/dev/null | grep -i -E "astguiclient|AST_|keepalive" || echo "no vicidial cron for root"'
run bash -c 'test -f /etc/astguiclient.conf && grep -vE "^\s*#|PASS" /etc/astguiclient.conf | sed "s/PASS.*/PASS=***/"'
run bash -c 'curl -sI http://127.0.0.1/vicidial/admin.php 2>/dev/null | head -1 || echo "vicidial web not answering on localhost"'

sec "WEB / DB / PHP / NODE"
run bash -c 'systemctl is-active apache2 nginx 2>/dev/null'
run bash -c 'apachectl -v 2>/dev/null; nginx -v 2>&1'
run bash -c 'systemctl is-active mysql mariadb 2>/dev/null'
run bash -c 'mysql --version'
run bash -c 'mysql -N -e "SELECT VERSION(); SHOW DATABASES;" 2>/dev/null || echo "cannot connect to mysql as current user"'
run bash -c 'php -v 2>/dev/null | head -1'
run bash -c 'node -v 2>/dev/null; npm -v 2>/dev/null'

sec "SECURITY / NETWORK"
run bash -c 'ufw status verbose 2>/dev/null || echo "ufw not installed/inactive"'
run bash -c 'systemctl is-active fail2ban 2>/dev/null && fail2ban-client status 2>/dev/null'
run bash -c 'ss -tulpn | sort'
run bash -c 'ss -tnp state established | head -40'
run systemctl list-units --type=service --state=running --no-pager

sec "SUMMARY HINTS"
echo "  • chan_sip must be NOT loaded; res_pjsip must be loaded."
echo "  • AMI (5038) and MySQL (3306) should listen on 127.0.0.1 ONLY."
echo "  • Note the Asterisk version, VICIdial presence, and free disk for backups."
echo
echo "Done. Save this output — it fills section 33 of the runbook."
