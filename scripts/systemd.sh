#!/bin/bash

echo "Creating startup systemd service..."

SERVICE_NAME="matrix-queue"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
WORKING_DIR="$(cd "$(dirname "$0")/.." && pwd)"
USER_NAME="$(whoami)"

if [ -f "SERVICE_FILE" ]; then
	echo "Service file already exists. Overwrite? (y/n)"
	read -r answer
	if [[ "$answer" != "y" ]]; then
		echo "Aborting service setup."
		exit 1
	fi
fi

sudo bash -c "cat > $SERVICE_FILE" <<EOF
[Unit]
Description=MATRIX Queue
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$WORKING_DIR

ExecStart=$(which node) $WORKING_DIR/index.js
Restart=always
RestartSec=5

Environment=PATH=/usr/bin:/usr/local/bin

StandardOutput=journal
StandardError=journal

SyslogIdentifier=matrix-queue

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME
sudo systemctl start $SERVICE_NAME

echo "Service setup complete: ${SERVICE_NAME}"
