const path = require("path");
const fs = require("fs");
const axios = require("axios");
require("dotenv").config();

const {
    PRINTER_IP,
    BACKEND_URL,
    POLL_INTERVAL_MS = 5000,
    STATE_FILE = "./printer-state.json",
} = process.env;

const DUET_BASE = `http://${PRINTER_IP}`;

function loadState() {
    if (!fs.existsSync(STATE_FILE)) return { state: 0 };
    try {
        return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    } catch (e) {
        return { state: 0 };
    }
}

function saveState(s) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

let state = loadState();
let pollLock = false;
const duet = axios.create({ baseURL: DUET_BASE, timeout: 4000 });

async function getPrinterData() {
    try {
        const [statusRes, msgRes] = await Promise.all([
            duet.get("/rr_model?key=state.status"),
            duet.get("/rr_model?key=state.messageBox"),
        ]);
        return {
            status: statusRes.data.result,
            messageBox: msgRes.data.result,
        };
    } catch (err) {
        console.error(`❌ Duet Offline (${PRINTER_IP}):`, err.message);
        return null;
    }
}

async function poll() {
    if (pollLock) return;
    pollLock = true;

    try {
        const data = await getPrinterData();
        if (!data) return;

        const { status, messageBox } = data;
        const isIdle = status === "idle";
        const messageIsNull = messageBox == null;

        console.log(`[${new Date().toLocaleTimeString()}] Internal: ${state.state} | Printer: ${status} | Msg: ${messageIsNull ? "Empty" : "ACTIVE"}`);

        // 1. SMART BUSY CHECK (The Safeguard)
        if (!isIdle) {
            // CRITICAL: If a message box is visible, the printer is technically "busy" 
            // processing the UI. Do NOT treat this as a manual print.
            if (!messageIsNull) {
                console.log("⏳ Message Box active. Holding state...");
                return; 
            }

            // Sync to State 0 only if we aren't in a transition state (2 or 3)
            const isTransitioning = (state.state === 2 || state.state === 3);
            if (!isTransitioning && state.state !== 0) {
                console.log("🔄 Printer is busy. Syncing state to 0 (Printing).");
                state.state = 0;
                saveState(state);
            }
            return;
        }

        // 2. IDLE LOGIC
        if (state.state === 0) {
            console.log("🏁 Printer reached idle. Moving to Scan state.");
            state.state = 1;
            saveState(state);
        }

        // State 1: Discovery
        if (state.state === 1) {
            console.log("🔍 Checking backend...");
            state.state = 2; // Lock
            saveState(state);

            try {
                const res = await axios.get(`${BACKEND_URL}/jobs/${PRINTER_IP}/ready`);
                if (res.status === 200 && res.data.jobFound) {
                    console.log(`✅ Job ${res.data.status}. Moving to Interaction.`);
                    state.state = 3; 
                } else {
                    console.log("💤 No jobs found.");
                    state.state = 1; 
                }
            } catch (err) {
                console.error("⚠️ Backend scan failed:", err.message);
                state.state = 1; 
            }
            saveState(state);
            return;
        }

        // State 3: User Interaction
        if (state.state === 3) {
            if (messageIsNull) {
                console.log("🔘 Button clicked! Locking and Sending G-code...");
                state.state = 2; // Lock
                saveState(state);

                try {
                    const sendRes = await axios.get(`${BACKEND_URL}/jobs/${PRINTER_IP}/send`);
                    if (sendRes.status === 200) {
                        console.log("🚀 Print started.");
                        state.state = 0; 
                    } else {
                        state.state = 3; // Retry on next poll
                    }
                } catch (err) {
                    console.error("❌ Send error:", err.message);
                    state.state = 3; // Keep waiting in Interaction
                }
                saveState(state);
            }
            return;
        }

    } catch (globalErr) {
        console.error("Critical Poll Error:", globalErr);
    } finally {
        pollLock = false;
    }
}

setInterval(poll, Number(POLL_INTERVAL_MS));