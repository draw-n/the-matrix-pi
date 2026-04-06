import RPi.GPIO as GPIO
import requests
import smtplib
from email.mime.text import MIMEText
import configparser
import time

# --- Configuration ---
config = configparser.ConfigParser()
config.read("/home/matrix/the-matrix-pi/help-button/config.ini")

BUTTON_PIN = 17
DEBOUNCE_MS = 300
HALT_MESSAGE = "Print halted by stop button"

DUET_IP       = config["duet"]["ip"]
DUET_PASSWORD = config["duet"]["password"]
BASE_URL      = f"http://{DUET_IP}"

EMAIL_SENDER    = config["email"]["sender"]
EMAIL_PASSWORD  = config["email"]["app_password"]
EMAIL_RECIPIENT = config["email"]["recipient"]
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

