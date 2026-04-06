import requests

DUET_IP = "10.1.68.193"  # your Duet's IP
BASE_URL = f"http://{DUET_IP}"

r = requests.get(f"{BASE_URL}/rr_connect", params={"password": "MATRIX"}, timeout=5)

print(f"Status code: {r.status_code}")
print(f"Raw response: '{r.text}'")
print(f"Headers: {dict(r.headers)}")