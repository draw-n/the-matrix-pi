# test_http.py
import requests

DUET_IP = "10.68.1.193"   # your Duet's IP
BASE_URL = f"http://{DUET_IP}"

def send_gcode(command):
    url = f"{BASE_URL}/rr_gcode"
    r = requests.get(url, params={"gcode": command}, timeout=5)
    print(f"Sent: {command} → {r.status_code}")

# Test 1 — ping Duet, get firmware info
send_gcode("M115")

# Test 2 — show popup on screen
send_gcode('M291 P"HTTP test OK" R"Pi Connected" S0')