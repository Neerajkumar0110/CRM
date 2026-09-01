# PHASE 0 — Re-image to Ubuntu 22.04 LTS + install VICIdial

> You chose the **full VICIdial** path. VICIdial needs a source-built,
> patched Asterisk + astguiclient + MySQL/MariaDB + Apache + PHP on a
> **supported OS**. Ubuntu 26.04 + `apt install asterisk` cannot run it, so
> this box gets re-imaged. Nothing of value is on it yet.
>
> After VICIdial is verified, run `deploy/phase1-inspect.sh` again and paste
> the output — I then wire the integration service to the VICIdial-managed
> Asterisk (config include strategy changes slightly because VICIdial owns
> `/etc/asterisk/*`).

---

## 0.1  Pre-flight (2 min)
- Confirm nothing on `200.141.5.195` matters (it's bare Asterisk only). ✔
- Note your provider's control-panel URL and the root password / SSH key
  upload field — you'll need it right after re-image.
- Keep your public key handy:
  `ssh-ed25519 AAAAC3Nz...wwn6 hp@LAPTOP-1O3QCHRL`

## 0.2  Re-image (provider control panel, ~5–10 min)
1. Provider panel → **Rebuild / Reinstall OS** → choose **Ubuntu 22.04 LTS
   (Jammy) 64-bit**. (If the panel offers "ViciBox" or "VICIdial" as a
   ready image, prefer that and skip 0.4 — go to 0.5.)
2. Add your SSH public key during rebuild if the panel allows; otherwise
   set a root password.
3. Wait for rebuild, then:
   ```bash
   ssh-keygen -R 200.141.5.195          # clear the old host key on your laptop
   ssh root@200.141.5.195
   cat /etc/os-release                  # expect: 22.04 / jammy
   ```

## 0.3  Base prep (5 min, run as root)
```bash
timedatectl set-timezone Asia/Kolkata
apt update && apt -y upgrade

# swap — a PBX + the Asterisk compile need it; you have 0 B now
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h

# basics
apt -y install curl wget git build-essential sudo ufw fail2ban
```

## 0.4  Install VICIdial on Ubuntu 22.04
Use **ONE** of these. Option A (ViciBox scratch method on Ubuntu) is the
closest to "official" for Ubuntu; Option B is a maintained community
script that is widely used.

### Option A — VICIdial "SCRATCH" install (official docs, Ubuntu 22.04)
Follow: <https://www.vicidial.org/docs/INSTALL_from_scratch.txt> (Ubuntu
section). In short, as root:
```bash
# 1. deps (perl, apache2, php, mariadb, sox, mpg123, lame, etc.)
apt -y install mariadb-server apache2 php php-cli php-mysql php-gd \
  libapache2-mod-php sox mpg123 lame libmyodbc unixodbc \
  libasound2-dev libnewt-dev libssl-dev libxml2-dev libsqlite3-dev \
  uuid-dev libjansson-dev libedit-dev subversion sipsak

# 2. get astguiclient (VICIdial) source
mkdir -p /usr/src/astguiclient && cd /usr/src/astguiclient
svn checkout svn://svn.eflo.net:3690/agc_2-X/trunk ./trunk
cd trunk

# 3. build the VICIdial-patched Asterisk (the installer script does this;
#    it downloads Asterisk 18/20 LTS + the DAHDI/patches VICIdial expects,
#    NOT the apt package). Follow the version the current trunk pins.
perl install.pl
#    → answer the prompts: install type = "scratch", DB name = asterisk,
#      set the DB passwords, let it compile Asterisk (20–40 min on 2 vCPU).

# 4. DB schema + sounds
mysql < /usr/src/astguiclient/trunk/extras/MySQL_AST_CREATE_tables.sql
/usr/src/astguiclient/trunk/extras/install_survey_audio.pl   # optional
```
Then set the cron jobs the installer prints (`crontab -e` for root: the
`AST_*` / `ADMIN_keepalive_ALL.pl` lines).

### Option B — community Ubuntu 22.04 installer (faster)
```bash
cd /usr/src
git clone https://github.com/n8ma/vicidial-install-scripts.git || \
git clone https://github.com/vicidialscratch/vicidial-install.git
# read the README, then run its Ubuntu 22.04 script as root and answer prompts
```
(Any auto-installer: read its script before running. It will build Asterisk
from source and load the VICIdial DB.)

### If your provider has a **ViciBox ISO** option
Best reliability. It's openSUSE-based, not Ubuntu — but it's the reference
platform. Boot the ISO, run `vicibox-install`, done. Then jump to 0.5.

## 0.5  Verify VICIdial (Phase 4 gate)
```bash
asterisk -rx "core show version"                 # source-built, VICIdial-patched
ls /usr/share/astguiclient/                       # ADMIN_keepalive_ALL.pl etc.
crontab -l | grep -c astguiclient                 # several cron lines
mysql -e "SELECT count(*) FROM asterisk.vicidial_campaigns"
mysql -e "SELECT count(*) FROM asterisk.vicidial_users"
curl -sI http://127.0.0.1/vicidial/admin.php | head -1   # 200 / 401
systemctl status asterisk mariadb apache2 --no-pager | grep Active
```
- Log in to `http://200.141.5.195/vicidial/admin.php`
  (default `6666` / `1234` — **change immediately**).
- Agent screen: `http://200.141.5.195/agc/vicidial.php`
- **Lock it down now**: put Apache behind the same nginx you'll add in
  Phase 9, or restrict the VICIdial vhost to your office IP. Never leave
  `admin.php` open to the world.

## 0.6  Re-run inspection + hand back to me
```bash
# copy this repo's telephony/ folder onto the box first:
#   (from your laptop)  scp -r telephony root@200.141.5.195:/opt/telephony
bash /opt/telephony/deploy/phase1-inspect.sh | tee /root/phase1-vicidial.txt
```
Paste `/root/phase1-vicidial.txt` back. I will then:
- adjust the Asterisk config strategy for VICIdial-managed `/etc/asterisk`
  (additive `#include` of `pjsip_crm.conf` + `extensions_crm.conf`, plus
  the `[crm]` AMI stanza in VICIdial's `manager.conf`),
- confirm `AGENT_EXTENSIONS` mapping to VICIdial `phone` / `phone_login`,
- finalise `vicidial/correlation.sql`, the API user, and the CRM
  `/lead/upsert` → `vicidial_list` + hopper wiring,
- then Phase 5–17 proceed as in `../README.md`.

## 0.7  What does NOT change
- The CRM backend + frontend work already done — unchanged.
- The `telephony/` service — unchanged (it already has
  `VICIDIAL_ENABLED` and the MySQL/non_agent_api clients).
- SIP provider — still a placeholder; `SIP_OUTBOUND_ENABLED=false` until
  credentials arrive.
