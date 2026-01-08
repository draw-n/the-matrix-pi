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
    const res = await axios.get(
        `${DUET_BASE}/rr_model?key=state.status`
    );
    if (res.status !== 200) throw new Error("Failed to fetch printer status");
    console.log(res.data);
    return res.data;
}

/* ================= BACKEND API ================= */

async function notifyBackend(payload) {
    const res = await axios.post(`${BACKEND_URL}/jobs/${PRINTER_IP}/ready`, payload, {
        headers: {
            "Content-Type": "application/json",
        },
    });

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

        const currentStatus = status.result;
        const currentFile = status.job?.file?.fileName ?? null;

        const isIdle = currentStatus === "idle";

        if (isIdle) {
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
