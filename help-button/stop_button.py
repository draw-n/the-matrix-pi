#!/usr/bin/env python3
# emergency_stop_http.py

import RPi.GPIO as GPIO
import requests
import time

# --- Configuration ---
BUTTON_PIN = 17
DUET_IP = "10.68.1.193"    # Change to your Duet's IP
BASE_URL = f"http://{DUET_IP}"
DUET_PASSWORD = "MATRX"           # Set if you have a password on Duet Web Control
DEBOUNCE_MS = 300
HALT_MESSAGE = "Print halted by stop button"

def connect_to_duet():
    try:
        r = requests.get(
            f"{BASE_URL}/rr_connect",
            params={"password": DUET_PASSWORD},
            timeout=5
        )
        data = r.json()
        if data.get("err") == 0:
            print("Connected to Duet")
            return True
        else:
            print(f"Duet rejected connection: {data}")
            return False
    except Exception as e:
        print(f"Connect failed: {e}")
        return False

def send_gcode(command):
    try:
        r = requests.get(
            f"{BASE_URL}/rr_gcode",
            params={"gcode": command},
            timeout=5
        )
        print(f"Sent: {command} → {r.status_code}")
    except Exception as e:
        print(f"Failed to send {command}: {e}")

def button_pressed(channel):
    print("Button pressed! Halting printer...")
    if connect_to_duet():
        send_gcode("M25")
        time.sleep(0.3)
        send_gcode(f'M291 P"{HALT_MESSAGE}" R"Stopped" S0')
        print("Done.")
    else:
        print("Could not reach Duet — is it on the network?")

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