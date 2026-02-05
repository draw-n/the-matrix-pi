#!/usr/bin/env bash
set -e

# Ensure we can find node, npm, and pm2
export PATH=$PATH:/usr/local/bin:/usr/bin:/bin

REPO_URL="https://github.com/draw-n/the-matrix-pi"
TARGET_DIR="/home/matrix/the-matrix-pi"
CAMERA_DIR="$TARGET_DIR/camera"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# 1. Wait for network
until ping -c1 google.com >/dev/null 2>&1; do
  log "Waiting for network..."
  sleep 5
done

# 2. Update code
if [ ! -d "$TARGET_DIR/.git" ]; then
  log "Cloning..."
  git clone "$REPO_URL" "$TARGET_DIR"
  cd "$TARGET_DIR"
else
  log "Updating..."
  cd "$TARGET_DIR"
  git pull
fi

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

cd "$TARGET_DIR"

# 5. Reload the App (PM2)
# Using the full path ensures it never fails
PM2_PATH=$(which pm2)
log "Reloading application code..."
$PM2_PATH reload matrix-queue || $PM2_PATH start index.js --name "matrix-queue"

log "Update complete."