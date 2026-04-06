# test_http.py
import requests
import configparser
import time

# --- Configuration ---
config = configparser.ConfigParser()
config.read("/home/matrix/the-matrix-pi/help-button/config.ini")

DUET_IP = config["duet"]["ip"]   # your Duet's IP
BASE_URL = f"http://{DUET_IP}"

r = requests.get(f"{BASE_URL}/rr_connect", params={"password": ""}, timeout=5)
print(f"Connect: {r.json()}")  # should show {{"err": 0}}

# Step 2 — send G-code
r = requests.get(f"{BASE_URL}/rr_gcode", params={"gcode": "M115"}, timeout=5)
print(f"M115: {r.status_code}")

# Step 3 — show popup on screen
r = requests.get(f"{BASE_URL}/rr_gcode", params={"gcode": 'M291 P"HTTP test OK" R"Pi Connected" S0'}, timeout=5)
print(f"M291: {r.status_code}")
