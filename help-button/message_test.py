# test_announcement.py
import requests
from datetime import datetime, timezone
import configparser
import time

# --- Load config ---
config = configparser.ConfigParser()
config.read("/home/matrix/the-matrix-pi/help-button/config.ini")

DUET_IP          = config["duet"]["ip"]
DUET_PASSWORD    = config["duet"]["password"]
BASE_URL         = f"http://{DUET_IP}"

WEBSITE_URL      = config["website"]["url"]
INTERNAL_KEY     = config["website"]["internal_key"]
CREATED_BY       = config["website"]["announcement_created_by"]
ANNOUNCEMENT_URL = f"{WEBSITE_URL}{config['website']['announcement_path']}"

HALT_MESSAGE     = "Issue fixed? Press OK to clear announcement."
POLL_INTERVAL    = 2

session_key      = 0

# --- Duet functions ---

def connect_to_duet():
    global session_key
    r = requests.get(
        f"{BASE_URL}/rr_connect",
        params={"password": DUET_PASSWORD},
        timeout=5
    )
    data = r.json()
    if data.get("err") == 0:
        session_key = data.get("sessionKey", 0)
        print("Connected to Duet")
        return True
    print(f"Duet connection failed: {data}")
    return False

def send_gcode(command):
    r = requests.get(
        f"{BASE_URL}/rr_gcode",
        params={"gcode": command},
        headers={"X-Session-Key": str(session_key)},
        timeout=5
    )
    print(f"Sent: {command} → {r.status_code}")

def get_reply():
    r = requests.get(
        f"{BASE_URL}/rr_reply",
        headers={"X-Session-Key": str(session_key)},
        timeout=5
    )
    return r.text.strip()

# --- Announcement functions ---

def post_announcement():
    timestamp   = datetime.now(timezone.utc).isoformat()
    description = (
        "The 3D printer has been halted via the emergency stop button.\n"
        "File: test.gcode\n"
        "Progress at time of halt: 42.0%"
    )
    payload = {
        "type":        "other",
        "title":       "3D Printer Halted",
        "description": description,
        "createdBy":   CREATED_BY,
        "dateCreated": timestamp,
        "status":      "posted",
    }
    r = requests.post(
        ANNOUNCEMENT_URL,
        json=payload,
        headers={"x-internal-key": INTERNAL_KEY},
        timeout=5
    )
    if r.status_code == 200:
        uuid = r.json().get("uuid")
        print(f"Announcement posted → {uuid}")
        return uuid
    else:
        print(f"Announcement failed: {r.status_code} {r.text}")
        return None

def delete_announcement(uuid):
    r = requests.delete(
        f"{ANNOUNCEMENT_URL}/{uuid}",
        headers={"x-internal-key": INTERNAL_KEY},
        timeout=5
    )
    if r.status_code == 200:
        print(f"Announcement deleted → {uuid}")
    else:
        print(f"Delete failed: {r.status_code} {r.text}")

# --- Main test flow ---

def main():
    # 1. Connect to Duet
    if not connect_to_duet():
        print("Could not connect to Duet, aborting.")
        return

    # 2. Post announcement on website
    uuid = post_announcement()
    if not uuid:
        print("Could not post announcement, aborting.")
        return

    # 3. Show M291 confirmation dialog on Duet screen
    send_gcode(f'M291 P"{HALT_MESSAGE}" R"Printer Halted" S1')
    print("\nWaiting for operator to press OK or Cancel on Duet screen...")

    # 4. Poll rr_reply for operator response
    while True:
        time.sleep(POLL_INTERVAL)

        if not connect_to_duet():
            continue

        reply = get_reply()

        if not reply:
            continue

        print(f"Duet reply: {reply}")

        if "ok" in reply.lower():
            print("Operator confirmed fix — deleting announcement.")
            delete_announcement(uuid)
            send_gcode('M291 P"Announcement cleared. Resume when ready." R"Fixed" S0')
            print("Done.")
            break

        elif "cancel" in reply.lower():
            print("Operator pressed Cancel — re-showing dialog in 30s.")
            time.sleep(30)
            send_gcode(f'M291 P"{HALT_MESSAGE}" R"Printer Halted" S1')
            print("Waiting for operator response...")

if __name__ == "__main__":
    main()