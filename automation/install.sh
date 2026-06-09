#!/usr/bin/env bash
# Installer for the GH-Issues → Claude-Code worker.
# Run as root on a fresh host with: node>=20, jq, git, gh, claude.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
BOT_USER="${BOT_USER:-claude-bot}"
BOT_HOME="/home/${BOT_USER}"
WORKER_DIR="${BOT_HOME}/worker"
LOGS_DIR="${BOT_HOME}/logs"
REPO_DIR="${BOT_HOME}/repo"
WT_BASE="${BOT_HOME}/worktrees"

REQUIRED_BINARIES=(node jq git gh claude)

# --- prereq ---
for bin in "${REQUIRED_BINARIES[@]}"; do
  command -v "$bin" >/dev/null || { echo "missing: $bin"; exit 1; }
done
[[ $EUID -eq 0 ]] || { echo "run as root"; exit 1; }

# --- bot user ---
if ! id -u "$BOT_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /bin/bash "$BOT_USER"
  echo "[+] created user $BOT_USER"
fi

install -d -o "$BOT_USER" -g "$BOT_USER" "$WORKER_DIR" "$LOGS_DIR" "$WT_BASE"

# --- copy worker files ---
cp "$DIR/worker/"{webhook,worker,extract-followups,health-queue,tune}.mjs "$WORKER_DIR/"
cp "$DIR/worker/"{run-claude,auto-retry}.sh "$WORKER_DIR/"
cp "$DIR/worker/"{package.json,package-lock.json,tuning.json} "$WORKER_DIR/"
chmod +x "$WORKER_DIR"/*.sh
chown -R "$BOT_USER:$BOT_USER" "$WORKER_DIR"

# --- npm install ---
cd "$WORKER_DIR" && sudo -u "$BOT_USER" -H npm ci --omit=dev
cd "$DIR"

# --- env ---
if [[ ! -f "$WORKER_DIR/.env" ]]; then
  cp "$DIR/worker/.env.example" "$WORKER_DIR/.env"
  chown "$BOT_USER:$BOT_USER" "$WORKER_DIR/.env"
  chmod 600 "$WORKER_DIR/.env"

  read -rp "GitHub webhook shared secret (random 32+ char hex): " WHS
  read -rp "Bot's GitHub login (to filter self-events): " BOT_GH
  sed -i "s/^WEBHOOK_SECRET=$/WEBHOOK_SECRET=${WHS}/" "$WORKER_DIR/.env"
  sed -i "s/^BOT_GH_LOGIN=$/BOT_GH_LOGIN=${BOT_GH}/" "$WORKER_DIR/.env"
fi

# --- repo clone (if absent) ---
if [[ ! -d "$REPO_DIR/.git" ]]; then
  read -rp "Repo to clone (e.g. https://github.com/me/proj.git, blank to skip): " REPO_URL
  if [[ -n "$REPO_URL" ]]; then
    sudo -u "$BOT_USER" -H git clone "$REPO_URL" "$REPO_DIR"
  fi
fi

# --- systemd ---
install -m644 "$DIR/systemd/claude-webhook.service" /etc/systemd/system/claude-webhook.service
install -m644 "$DIR/systemd/claude-worker.service"  /etc/systemd/system/claude-worker.service
systemctl daemon-reload
systemctl enable claude-webhook claude-worker

# --- nginx (best-effort) ---
NGINX_VHOST_DIR="${NGINX_VHOST_DIR:-/etc/nginx-rc/extra.d}"
if [[ -d "$NGINX_VHOST_DIR" ]]; then
  install -m644 "$DIR/nginx/claude-webhook.location.conf" \
    "$NGINX_VHOST_DIR/claude-webhook.conf"
  echo "[+] dropped nginx-rc location into $NGINX_VHOST_DIR/"
  echo "    Reload your reverse proxy AFTER pointing the GH webhook URL at:"
  echo "    https://<host>/_claude-webhook/github"
else
  echo "[ ! ] $NGINX_VHOST_DIR not found — place nginx/claude-webhook.location.conf"
  echo "      into your reverse-proxy config manually."
fi

# --- claude-health bin ---
install -m755 "$DIR/bin/claude-health" /usr/local/bin/claude-health

# --- finish ---
systemctl start claude-webhook claude-worker || true
sleep 1
systemctl is-active claude-webhook claude-worker

cat <<NOTE

==== install done ====
Next:
  1. sudo -u $BOT_USER -H gh auth login --hostname github.com
     (use the bot's GitHub account, NOT yours)
  2. Reload your reverse proxy (nginx-rc -s reload, nginx -s reload, ...).
  3. Add the webhook in GitHub: Repo → Settings → Webhooks.
     URL:    https://<host>/_claude-webhook/github
     Secret: the value of WEBHOOK_SECRET in $WORKER_DIR/.env
     Events: Issues, Issue comments
  4. claude-health
NOTE
