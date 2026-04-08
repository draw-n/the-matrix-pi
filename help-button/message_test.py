# test_announcement.py
import requests
from datetime import datetime, timezone
import configparser

# --- Load config ---
config = configparser.ConfigParser()
config.read("/home/matrix/the-matrix-pi/help-button/config.ini")

WEBSITE_URL      = config["website"]["url"]
INTERNAL_KEY     = config["website"]["internal_key"]
CREATED_BY       = config["website"]["announcement_created_by"]
ANNOUNCEMENT_URL = f"{WEBSITE_URL}{config['website']['announcement_path']}"

payload = {
    "type":        "other",
    "title":       "3D Printer Halted",
    "description": "Test announcement from Raspberry Pi.\nFile: test.gcode\nProgress: 42.0%",
    "createdBy":   CREATED_BY,
    "dateCreated": datetime.now(timezone.utc).isoformat(),
    "status":      "posted",
}

print(f"Posting to: {ANNOUNCEMENT_URL}")

r = requests.post(
    ANNOUNCEMENT_URL,
    json=payload,
    headers={"x-internal-key": INTERNAL_KEY},
    timeout=5
)

print(f"Status: {r.status_code}")
print(f"Response: {r.json()}")