const path = require("path");
const fs = require("fs");
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
    const res = await fetch(`${DUET_BASE}/machine/rr_model?key=state.status`);
    if (!res.ok) throw new Error("Failed to fetch printer status");
    const text = await res.text();
    console.log(text);
    return res.json();
}

/* ================= BACKEND API ================= */

async function notifyBackend(payload) {
    const res = await fetch(`${BACKEND_URL}/jobs/${PRINTER_IP}/ready`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        throw new Error(`Backend error: ${res.status}`);
    }
    const text = await res.text();
    console.log(text);
    return res.json();
}

/* ================= MAIN LOOP ================= */

async function poll() {
    try {
        const status = await getPrinterStatus();

        const currentStatus = status.state?.status;
        const currentFile = status.job?.file?.fileName ?? null;

        const wasProcessing = state.lastStatus === "processing";
        const isIdle = currentStatus === "idle";

        if (wasProcessing && isIdle) {
            console.log("Print completed");

            const response = await notifyBackend("");
        }

        state.lastStatus = currentStatus;
        saveState(state);
    } catch (err) {
        console.error("Poll error:", err.message);
    }
}

console.log("🟢 Duet Pi agent started");
setInterval(poll, Number(POLL_INTERVAL_MS));
