#!/usr/bin/env python3
# emergency_stop_http.py

import RPi.GPIO as GPIO
import requests
import configparser
import time
import threading
from datetime import datetime, timezone

# --- Load config ---
config = configparser.ConfigParser()
config.read("/home/matrix/the-matrix-pi/help-button/config.ini")

BUTTON_PIN      = 17
DEBOUNCE_MS     = 300
HALT_MESSAGE    = "Issue fixed? Press OK to clear announcement."
POLL_INTERVAL   = 2  # seconds between reply polls (keep low to catch response fast)

DUET_IP         = config["duet"]["ip"]
DUET_PASSWORD   = config["duet"]["password"]
BASE_URL        = f"http://{DUET_IP}"

WEBSITE_URL      = config["website"]["url"]
CREATED_BY       = config["website"]["announcement_created_by"]
ANNOUNCEMENT_URL = f"{WEBSITE_URL}{config['website']['announcement_path']}"
INTERNAL_KEY     = config["website"]["internal_key"]

# -------------------------------------------------------

session_key         = 0
active_announcement = None   # uuid of current halt announcement
printer_halted      = False  # track if we triggered a halt
poll_thread         = None   # reference to active polling thread

def connect_to_duet():
    global session_key
    try:
        r = requests.get(
            f"{BASE_URL}/rr_connect",
            params={"password": DUET_PASSWORD},
            timeout=5
        )
        data = r.json()
        if data.get("err") == 0:
            session_key = data.get("sessionKey", 0)
            return True
        return False
    except Exception as e:
        print(f"Connect error: {e}")
        return False

def send_gcode(command):
    try:
        r = requests.get(
            f"{BASE_URL}/rr_gcode",
            params={"gcode": command},
            headers={"X-Session-Key": str(session_key)},
            timeout=5
        )
        print(f"Sent: {command} → {r.status_code}")
    except Exception as e:
        print(f"Failed to send {command}: {e}")

def get_print_status():
    try:
        r = requests.get(
            f"{BASE_URL}/rr_status",
            params={"type": "3"},
            headers={"X-Session-Key": str(session_key)},
            timeout=5
        )
        data = r.json()
        filename     = data.get("job", {}).get("file", {}).get("fileName", "Unknown")
        progress     = data.get("job", {}).get("fractionPrinted", 0)
        progress_pct = round(float(progress) * 100, 1) if progress else 0
        return filename, progress_pct
    except:
        return "Unknown", 0

def get_reply():
    """Poll rr_reply to check if operator responded to M291 dialog."""
    try:
        r = requests.get(
            f"{BASE_URL}/rr_reply",
            headers={"X-Session-Key": str(session_key)},
            timeout=5
        )
        return r.text.strip()
    except:
        return ""

def send_announcement(filename, progress):
    global active_announcement

    if active_announcement:
        print(f"Announcement already active: {active_announcement}, skipping.")
        return

    timestamp   = datetime.now(timezone.utc).isoformat()
    description = (
        f"The 3D printer has been halted via the emergency stop button.\n"
        f"File: {filename}\n"
        f"Progress at time of halt: {progress}%"
    )
    payload = {
        "type":        "other",
        "title":       "3D Printer Halted",
        "description": description,
        "createdBy":   CREATED_BY,
        "dateCreated": timestamp,
        "status":      "posted",
    }
    try:
        r = requests.post(
            ANNOUNCEMENT_URL,
            json=payload,
            headers={"x-internal-key": INTERNAL_KEY},
            timeout=5
        )
        if r.status_code == 200:
            active_announcement = r.json().get("uuid")
            print(f"Announcement posted → {active_announcement}")
        else:
            print(f"Announcement failed: {r.status_code} {r.text}")
    except Exception as e:
        print(f"Announcement error: {e}")

def delete_announcement():
    global active_announcement

    if not active_announcement:
        return

    try:
        r = requests.delete(
            f"{ANNOUNCEMENT_URL}/{active_announcement}",
            headers={"x-internal-key": INTERNAL_KEY},
            timeout=5
        )
        if r.status_code == 200:
            print(f"Announcement deleted → {active_announcement}")
            active_announcement = None
        else:
            print(f"Delete failed: {r.status_code} {r.text}")
    except Exception as e:
        print(f"Delete error: {e}")

def poll_for_confirmation():
    """
    Poll rr_reply every POLL_INTERVAL seconds.
    M291 S1 sets reply to:
      - "OK" if operator pressed OK      → fix confirmed, delete announcement
      - "Cancel" if operator pressed Cancel → ignore, keep announcement up
    """
    global printer_halted

    print("Waiting for operator confirmation on Duet screen...")

    while printer_halted:
        time.sleep(POLL_INTERVAL)

        if not connect_to_duet():
            continue

        reply = get_reply()

        if not reply:
            continue

        print(f"Duet reply: {reply}")

        if "ok" in reply.lower():
            print("Operator confirmed fix — clearing announcement.")
            delete_announcement()
            printer_halted = False

            # Notify on Duet screen that announcement is cleared
            send_gcode('M291 P"Announcement cleared. Resume when ready." R"Fixed" S0')

        elif "cancel" in reply.lower():
            # Operator dismissed without fixing — re-show the dialog after a delay
            print("Operator pressed Cancel — re-showing dialog in 30s.")
            time.sleep(30)
            if printer_halted:
                send_gcode(f'M291 P"{HALT_MESSAGE}" R"Printer Halted" S1')

def button_pressed(channel):
    global printer_halted, poll_thread

    if printer_halted:
        print("Already halted, ignoring button press.")
        return

    print("Button pressed! Halting printer...")

    if connect_to_duet():
        filename, progress = get_print_status()

        # 1. Pause print
        send_gcode("M25")
        time.sleep(0.3)

        # 2. Show confirmation dialog on Duet screen
        # S1 = OK + Cancel buttons
        send_gcode(f'M291 P"{HALT_MESSAGE}" R"Printer Halted" S1')

        # 3. Post announcement on website
        send_announcement(filename, progress)

        printer_halted = True

        # 4. Start polling for operator response in background
        poll_thread = threading.Thread(target=poll_for_confirmation, daemon=True)
        poll_thread.start()

        print("Done. Waiting for operator to confirm fix on Duet screen.")
    else:
        print("Could not reach Duet.")

def main():
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(BUTTON_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
    GPIO.add_event_detect(
        BUTTON_PIN,
        GPIO.FALLING,
        callback=button_pressed,
        bouncetime=DEBOUNCE_MS
    )

    print(f"Emergency stop ready → {BASE_URL}")
    print("Press Ctrl+C to exit.\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nExiting.")
    finally:
        GPIO.cleanup()

if __name__ == "__main__":
    main()