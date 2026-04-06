#!/usr/bin/env python3
# emergency_stop.py
# Wiring: Button between GPIO 17 (Pin 11) and GND (Pin 6)

import RPi.GPIO as GPIO
import serial
import time

# --- Configuration ---
BUTTON_PIN = 17          # GPIO pin number (BCM mode)
SERIAL_PORT = "/dev/ttyUSB0"   # Change to diff port later 
BAUD_RATE = 115200
DEBOUNCE_MS = 300        # Milliseconds to debounce button

# Message shown on Duet screen (max ~40 chars)
HALT_MESSAGE = "Print halted by stop button"

def send_gcode(ser, command):
    """Send a G-code command and wait for 'ok' response."""
    cmd = (command + "\n").encode("utf-8")
    ser.write(cmd)
    print(f"Sent: {command}")
    time.sleep(0.1)
    response = ser.read_all().decode("utf-8", errors="ignore").strip()
    if response:
        print(f"Response: {response}")

def button_pressed(channel):
    """Callback fired when button is pressed."""
    print("Button pressed! Halting printer...")
    try:
        with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2) as ser:
            time.sleep(0.1)  # Let serial port settle
            
            send_gcode(ser, "M81") #Change gcode cmd later (?), curr = turn ATX power off
            
            
        print("Done. Printer halted.")
    except serial.SerialException as e:
        print(f"Serial error: {e}")
        print(f"Check that {SERIAL_PORT} is correct (try /dev/ttyACM0)")

def main():
    # GPIO setup
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(BUTTON_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)

    # Attach interrupt — fires on button press (HIGH -> LOW)
    GPIO.add_event_detect(
        BUTTON_PIN,
        GPIO.FALLING,
        callback=button_pressed,
        bouncetime=DEBOUNCE_MS
    )

    print(f"Emergency stop ready. Watching GPIO {BUTTON_PIN}...")
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