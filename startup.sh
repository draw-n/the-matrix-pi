#!/usr/bin/env bash
set -e

REPO_URL="https://github.com/draw-n/the-matrix-pi"
CAMERA_DIR="./camera"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Startup script running..."

# Wait for network
until ping -c1 github.com >/dev/null 2>&1; do
  log "Waiting for network..."
  sleep 5
done

# Clone or update repo
if [ ! -d ".git" ]; then
  log "Cloning repository..."
  git clone "$REPO_URL" "."
else
  log "Updating repository..."
  cd "."
  git pull
fi

# Install dependencies (safe to re-run)
log "Installing npm dependencies..."
npm install

# Start / restart camera containers
if [ -d "$CAMERA_DIR" ]; then
  log "Starting camera docker compose..."
  cd "$CAMERA_DIR"
  docker compose down || true
  docker compose pull
  docker compose up -d
fi

# Start Node app with PM2
cd ".."

if pm2 list | grep -q "matrix-queue"; then
  log "Restarting PM2 app..."
  pm2 restart matrix-queue
else
  log "Starting PM2 app..."
  pm2 start npm --name "matrix-queue" -- start
fi

# Persist PM2 across reboot
pm2 save

log "Startup script completed."
