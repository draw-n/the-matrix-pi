#!/usr/bin/env bash
set -e

# Ensure we can find node, npm, and pm2
export PATH=$PATH:/usr/local/bin:/usr/bin:/bin

TARGET_DIR="$(pwd)/.."
CAMERA_DIR="$TARGET_DIR/camera"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# 3. Dependencies
log "Updating npm packages..."
npm install

# 4. Handle Docker (Cameras)
if [ -d "$CAMERA_DIR" ]; then
  log "Cycling Docker containers..."
  cd "$CAMERA_DIR"
  docker compose pull
  docker compose up -d
fi


# 5. Reload the App (Systemd)
if systemctl cat matrix-queue.service >/dev/null 2>&1; then
	sudo systemctl restart matrix-queue.service
else
	./systemd.sh
	sudo systemctl start matrix-queue.service
fi

log "Update complete."
