#!/usr/bin/env python3
# emergency_stop_http.py
# Wiring: Button between GPIO 17 (Pin 11) and GND (Pin 6)

import RPi.GPIO as GPIO
import requests
import time

# --- Configuration ---
BUTTON_PIN = 17
DUET_IP = "192.168.1.100"    # Change to your Duet's IP address
BASE_URL = f"http://{DUET_IP}"
DEBOUNCE_MS = 300

def send_gcode(command):
    """Send G-code to Duet via HTTP."""
    try:
        url = f"{BASE_URL}/rr_gcode"
        response = requests.get(url, params={"gcode": command}, timeout=5)
        print(f"Sent: {command} → Status: {response.status_code}")
        return True
    except requests.exceptions.ConnectionError:
        print(f"Connection failed — is Duet at {DUET_IP}?")
        return False
    except requests.exceptions.Timeout:
        print("Request timed out — Duet not responding")
        return False

def button_pressed(channel):
    print("Button pressed! Halting printer...")

    send_gcode("M81")
    time.sleep(0.3)

    print("Done.")

def main():
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(BUTTON_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
    GPIO.add_event_detect(
        BUTTON_PIN,
        GPIO.FALLING,
        callback=button_pressed,
        bouncetime=DEBOUNCE_MS
    )

    print(f"Emergency stop ready (HTTP mode) → {BASE_URL}")
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