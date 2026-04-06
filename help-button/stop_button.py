#!/usr/bin/env python3
# emergency_stop_http.py — RRF2 + email notification

import RPi.GPIO as GPIO
import requests
import smtplib
from email.mime.text import MIMEText
import time

# --- Configuration ---
BUTTON_PIN = 17
DUET_IP = "10.68.1.176"
BASE_URL = f"http://{DUET_IP}"
DUET_PASSWORD = "MATRIX"
DEBOUNCE_MS = 300
HALT_MESSAGE = "Print halted by stop button"

# --- Email config ---
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
EMAIL_SENDER = "lyloe2011@gmail.com"
EMAIL_PASSWORD = "Lyloe20112007"   # Gmail app password, not your real password
EMAIL_RECIPIENT = "ly.v.tran@vanderbilt.edu"

# -------------------------------------------------------

session_key = 0

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
            print("Connected to Duet")
            return True
        else:
            print(f"Duet rejected connection: {data}")
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
        filename = data.get("job", {}).get("file", {}).get("fileName", "Unknown")
        progress = data.get("job", {}).get("fractionPrinted", 0)
        progress_pct = round(float(progress) * 100, 1) if progress else 0
        return filename, progress_pct
    except:
        return "Unknown", 0

def send_email(filename, progress):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    body = (
        f"3D Printer Halted\n\n"
        f"Time: {timestamp}\n"
        f"File: {filename}\n"
        f"Progress: {progress}%\n"
        f"Come hither"
    )
    try:
        msg = MIMEText(body)
        msg["Subject"] = "3D Printer Halted"
        msg["From"] = EMAIL_SENDER
        msg["To"] = EMAIL_RECIPIENT

        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(EMAIL_SENDER, EMAIL_PASSWORD)
            server.sendmail(EMAIL_SENDER, EMAIL_RECIPIENT, msg.as_string())
        print("Email sent")
    except Exception as e:
        print(f"Email error: {e}")

def button_pressed(channel):
    print("Button pressed! Halting printer...")
    if connect_to_duet():
        filename, progress = get_print_status()
        send_gcode("M25")
        time.sleep(0.3)
        send_gcode(f'M291 P"{HALT_MESSAGE}" R"Stopped" S0')
        send_email(filename, progress)
        print("Done.")
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