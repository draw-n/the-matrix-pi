const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

/* ================= CONFIG ================= */

const {
    PRINTER_IP,
    BACKEND_URL,
    POLL_INTERVAL_MS = 5000,
    STATE_FILE = "./printer-state.json",
} = process.env;

const DUET_BASE = `http://${PRINTER_IP}`;

/* ================= STATE ================= */

function loadState() {
    if (!fs.existsSync(STATE_FILE)) {
        return { lastStatus: null };
    }
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}

function saveState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

let state = loadState();

/* ================= DUET API ================= */

async function getPrinterStatus() {
    const connect = await axios.get(`${DUET_BASE}/rr_connect?password=`);
    console.log("Connected to printer:", connect.data);
    const res = await axios.get(`${DUET_BASE}/rr_model?key=state.status`);
    if (res.status !== 200) throw new Error("Failed to fetch printer status");
    console.log(res.data);
    return res.data;
}

async function getMessageStatus() {
    const connect = await axios.get(`${DUET_BASE}/rr_connect?password=`);
    console.log("Connected to printer:", connect.data);
    const res = await axios.get(`${DUET_BASE}/rr_model?key=state.messageBox`);
    if (res.status !== 200) throw new Error("Failed to fetch message status");
    console.log(res.data);
    return res.data;
}

/* ================= BACKEND API ================= */

async function notifyBackend() {
    const res = await axios.get(`${BACKEND_URL}/jobs/${PRINTER_IP}/ready`);

    if (res.status !== 200) {
        throw new Error(`Backend error: ${res.status}`);
    }
    console.log(res.data);
    return res.data;
}

/* ================= MAIN LOOP ================= */


async function poll() {
    try {
        const status = await getPrinterStatus();
        const messageBox = await getMessageStatus();

        const currentStatus = status.result;
        const isIdle = currentStatus === "idle";
        const messageIsNull = messageBox.result == null;

        // State machine:
        // 0: busy, 1: idle & available, 2: waiting for backend, 3: job sent, waiting for messageBox to clear
        if (!isIdle) {
            // Printer busy
            if (state.state !== 0) {
                state.state = 0;
                saveState(state);
            }
            return;
        }

        // Printer is idle
        if (state.state === 3) {
            // Waiting for messageBox to clear
            if (messageIsNull) {
                // messageBox is null, send next job
                try {
                    const sendRes = await axios.get(`${BACKEND_URL}/jobs/${PRINTER_IP}/send`);
                    if (sendRes.status !== 200) throw new Error(`Backend send error: ${sendRes.status}`);
                    console.log("Sent next job:", sendRes.data);
                } catch (err) {
                    console.error("Error sending job:", err.message);
                }
                state.state = 0;
                saveState(state);
            }
            return;
        }

        // If idle and not in state 1, set to 1
        if (state.state !== 1 && state.state !== 2) {
            state.state = 1;
            saveState(state);
        }

        // If idle and state is 1, start backend request and set to 2 (waiting for backend)
        if (state.state === 1) {
            state.state = 2;
            saveState(state);
            try {
                const readyRes = await notifyBackend();
                console.log("Notified backend ready:", readyRes);
                // Only set to 3 if backend responds with a job (200)
                state.state = 3;
                saveState(state);
            } catch (err) {
                // If 404 or other error, revert state to 1
                state.state = 1;
                saveState(state);
                console.error("Error notifying backend ready:", err.message);
            }
        }
        // If state is 2, do nothing (waiting for backend response to finish)
    } catch (err) {
        console.error("Poll error:", err.message);
    }
}

console.log("🟢 Duet Pi agent started");
setInterval(poll, Number(POLL_INTERVAL_MS));
