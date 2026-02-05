#!/usr/bin/env bash
set -e

REPO_URL="https://github.com/draw-n/the-matrix-pi"
# Use absolute paths so it doesn't matter where the script is called from
TARGET_DIR="$HOME/the-matrix-pi"
#CAMERA_DIR="$TARGET_DIR/camera"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Startup script running..."

# Wait for network
until ping -c1 google.com >/dev/null 2>&1; do
  log "Waiting for network..."
  sleep 5
done

# Clone or update repo
if [ ! -d "$TARGET_DIR/.git" ]; then
  log "Cloning repository into $TARGET_DIR..."
  # Clone into the folder specifically, rather than "."
  git clone "$REPO_URL" "$TARGET_DIR"
  cd "$TARGET_DIR"
else
  log "Updating repository in $TARGET_DIR..."
  cd "$TARGET_DIR"
  git pull
fi

# Install dependencies
log "Installing npm dependencies..."
npm install

# Start / restart camera containers
# if [ -d "$CAMERA_DIR" ]; then
#   log "Starting camera docker compose..."
#   cd "$CAMERA_DIR"
#   docker compose down || true
#   docker compose pull
#   docker compose up -d
# fi

# # Start Node app with PM2
# cd "$TARGET_DIR"

# Check if pm2 process exists
if pm2 describe matrix-queue > /dev/null 2>&1; then
  log "Restarting PM2 app..."
  pm2 restart matrix-queue
else
  log "Starting PM2 app..."
  # We run 'npm start' or point directly to your app.js
  pm2 start index.js --name "matrix-queue" 
fi

pm2 save
log "Startup script completed."