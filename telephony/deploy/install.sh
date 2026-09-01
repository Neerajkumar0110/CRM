#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
#  PHASE 8 — install the Telephony Integration Service. Idempotent.
#  Run AFTER phase1-inspect + phase2-backup.
#      sudo bash deploy/install.sh
#  Assumes this folder was copied to /opt/telephony  (git clone / scp / rsync).
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail
APP=/opt/telephony

echo "1. node"
if ! command -v node >/dev/null || [ "$(node -pe 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "2. service user"
id telephony >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin telephony

echo "3. layout"
mkdir -p "$APP/data/queue" "$APP/logs"
chown -R telephony:telephony "$APP/data" "$APP/logs"
# recordings dir: the service only needs READ
usermod -aG asterisk telephony 2>/dev/null || true

echo "4. dependencies"
cd "$APP"
sudo -u telephony npm install --omit=dev --no-audit --no-fund

echo "5. .env"
if [ ! -f "$APP/.env" ]; then
  cp "$APP/.env.example" "$APP/.env"
  chown telephony:telephony "$APP/.env"
  chmod 600 "$APP/.env"
  echo "   -> created $APP/.env  — EDIT IT NOW (secrets, AMI, DB, CRM_BACKEND_URL)"
  echo "   -> generate secrets:  cd $APP && npm run gen-secrets"
fi

echo "6. systemd"
cp "$APP/deploy/systemd/telephony.service" /etc/systemd/system/telephony.service
systemctl daemon-reload
systemctl enable telephony
echo "   -> start when .env is filled:  systemctl start telephony"
echo "   -> logs:  journalctl -u telephony -f"

echo "7. nginx (optional now — needs the domain + certbot)"
echo "   cp $APP/deploy/nginx/telephony.conf /etc/nginx/sites-available/"
echo "   ln -s /etc/nginx/sites-available/telephony.conf /etc/nginx/sites-enabled/"
echo "   add the limit_req_zone line to /etc/nginx/nginx.conf http{}"
echo "   certbot --nginx -d telephony.yourdomain.com"

echo
echo "Install step done. Next: edit .env, then 'systemctl start telephony',"
echo "then 'curl -s http://127.0.0.1:4000/healthz'."
