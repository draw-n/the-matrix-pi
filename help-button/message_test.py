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

try:
    msg = MIMEText("message testttt")
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

