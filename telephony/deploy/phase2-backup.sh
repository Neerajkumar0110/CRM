#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
#  PHASE 2 — backups. Run BEFORE any config change. Nothing is deleted.
#  Backups go to /opt/telephony/backups/<timestamp>/ and are NEVER
#  auto-removed.
#      sudo bash phase2-backup.sh
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail
TS="$(date +%Y%m%d_%H%M%S)"
DEST="/opt/telephony/backups/${TS}"
mkdir -p "$DEST"
echo "Backing up to $DEST"

copy() { [ -e "$1" ] && cp -a "$1" "$DEST/" && echo "  ok  $1" || echo "  --  $1 (absent)"; }
tarball() { [ -d "$1" ] && tar czf "$DEST/$(echo "$1" | tr '/' '_').tgz" "$1" && echo "  ok  $1" || echo "  --  $1 (absent)"; }

echo "[config]"
tarball /etc/asterisk
copy /etc/astguiclient.conf
tarball /etc/apache2
tarball /etc/nginx
copy /etc/php
tarball /usr/share/astguiclient/conf 2>/dev/null || true
copy /etc/mysql
copy /etc/ufw
copy /etc/fail2ban

echo "[crontabs]"
mkdir -p "$DEST/crontabs"
crontab -l > "$DEST/crontabs/root.cron" 2>/dev/null || true
for u in asterisk www-data mysql; do
  crontab -l -u "$u" > "$DEST/crontabs/${u}.cron" 2>/dev/null || true
done

echo "[database]  (VICIdial / Asterisk DB)"
DB_NAME="${1:-asterisk}"
if command -v mysqldump >/dev/null; then
  # Uses the default my.cnf / socket auth. Add -u/-p if your setup needs it.
  mysqldump --single-transaction --routines --triggers "$DB_NAME" \
    | gzip > "$DEST/${DB_NAME}_${TS}.sql.gz" \
    && echo "  ok  mysqldump ${DB_NAME} -> ${DEST}/${DB_NAME}_${TS}.sql.gz" \
    || echo "  !!  mysqldump failed — run manually: mysqldump -u root -p ${DB_NAME} | gzip > ${DEST}/${DB_NAME}.sql.gz"
fi

echo "[manifest]"
{
  echo "created: $(date -Is)"
  echo "host: $(hostname)"
  echo "asterisk: $(asterisk -V 2>/dev/null)"
  du -sh "$DEST"
} > "$DEST/MANIFEST.txt"

echo
echo "Backup complete: $DEST"
echo "Verify the DB dump opens:  zcat ${DEST}/${DB_NAME}_${TS}.sql.gz | head"
