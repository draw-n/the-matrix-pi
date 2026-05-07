# the-matrix-pi

## Environment Variables
PRINTER_IP = "XX.XX.X.XXX"
BACKEND_URL= "XX.XX.X.XXX/XXX"

To setup:
```
cd scripts
./systemd.sh
sudo ./startup.sh
```

This should create a docker container and a systemd.service for the printer polling that'll both restart, even on reboot. To update everything after file changes, do sudo ./startup.sh again.
