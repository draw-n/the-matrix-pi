const path = require("path");
const fs = require("fs");
const axios = require("axios");
require("dotenv").config();

/* ================= CONFIG ================= */

const {
    PRINTER_IP,
    BACKEND_URL,
    POLL_INTERVAL_MS = 5000,
    STATE_FILE = "./printer-state.json",
} = process.env;

const DUET_BASE = `http://${PRINTER_IP}`;

/* ================= STATE MANAGEMENT ================= */

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

// Shared Axios instance for efficiency
const duet = axios.create({ baseURL: DUET_BASE, timeout: 4000 });

/* ================= HELPERS ================= */

async function getPrinterData() {
    try {
        // Fetching status and messageBox in parallel to ensure consistency
        const [statusRes, msgRes] = await Promise.all([
            duet.get("/rr_model?key=state.status"),
            duet.get("/rr_model?key=state.messageBox")
        ]);
        return {
            status: statusRes.data.result, // e.g. "idle", "busy", "processing"
            messageBox: msgRes.data.result // null or object { title, message, ... }
        };
    } catch (err) {
        console.error(`❌ Duet Offline (${PRINTER_IP}):`, err.message);
        return null;
    }
}

/* ================= MAIN POLL LOOP ================= */

async function poll() {
    if (pollLock) return; // Skip if a network request is still hanging
    pollLock = true;

    try {
        const data = await getPrinterData();
        if (!data) return; // Exit if printer is unreachable

        const { status, messageBox } = data;
        const isIdle = status === "idle";
        const messageIsNull = messageBox == null;

        console.log(`[${new Date().toLocaleTimeString()}] State: ${state.state} | Printer: ${status} | Msg: ${messageIsNull ? 'Empty' : 'ACTIVE'}`);

        /* STATE DEFINITIONS:
           0: Busy/Printing
           1: Idle/Ready to check backend
           2: Pending (Backend request in progress)
           3: Interaction (Waiting for user to click "OK" on printer screen)
        */

        // 1. HANDLE PRINTER BUSY
        if (!isIdle) {
            // Check: Are we actually busy, or just processing the "M291" message?
            // If we are in state 3 and a message is visible, ignore the "busy" status.
            const processingMessage = (state.state === 3 && !messageIsNull);

            if (!processingMessage && state.state !== 0) {
                console.log("🔄 Printer started a job or is busy. Syncing state to 0.");
                state.state = 0;
                saveState(state);
            }
            return;
        }

        // 2. PRINTER IS IDLE - LOGIC ENGINE
        
        // From Busy -> Ready
        if (state.state === 0) {
            state.state = 1;
            saveState(state);
        }

        // State 1: Ready to ask backend for work
        if (state.state === 1) {
            console.log("🔍 Checking backend for new jobs...");
            
            // LOCK: Move to state 2 BEFORE the await so concurrent polls skip this block
            state.state = 2;
            saveState(state);

            try {
                const res = await axios.get(`${BACKEND_URL}/jobs/${PRINTER_IP}/ready`);
                
                // Assuming backend returns 200 and some data if a message was sent
                if (res.status === 200 && res.data) {
                    console.log("✅ Backend triggered Message Box.");
                    state.state = 3;
                } else {
                    state.state = 1; // Revert to ready to try again next poll
                }
            } catch (err) {
                console.error("⚠️ Backend request failed:", err.message);
                state.state = 1; // Revert on error
            }
            saveState(state);
            return;
        }

        // State 3: Waiting for the human in the lab
        if (state.state === 3) {
            if (messageIsNull) {
                console.log("🔘 Message cleared by user! Sending print file...");
                try {
                    const sendRes = await axios.get(`${BACKEND_URL}/jobs/${PRINTER_IP}/send`);
                    if (sendRes.status === 200) {
                        console.log("🚀 Job successfully sent to printer.");
                        state.state = 0; // Set to busy
                    }
                } catch (err) {
                    console.error("❌ Failed to send job:", err.message);
                    state.state = 1; // Something went wrong, go back to ready
                }
                saveState(state);
            } else {
                // Do nothing, just wait for the box to become null
                console.log("⏳ Waiting for user to clear bed and click 'OK'...");
            }
        }

    } catch (globalErr) {
        console.error("Critical Poll Error:", globalErr);
    } finally {
        pollLock = false;
    }
}

console.log(`🟢 Duet Pi Agent active for ${PRINTER_IP}`);
setInterval(poll, Number(POLL_INTERVAL_MS));