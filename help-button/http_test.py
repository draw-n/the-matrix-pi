import requests

DUET_IP = "10.68.1.193"  # your Duet's IP
BASE_URL = f"http://{DUET_IP}"

r = requests.get(f"{BASE_URL}/machine/connect", params={"password": "MATRIX"}, timeout=5)

print(f"Status code: {r.status_code}")
print(f"Raw response: '{r.text}'")
