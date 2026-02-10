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

const duet = axios.create({ baseURL: DUET_BASE, timeout: 4000 });

/* ================= HELPERS ================= */

async function getPrinterData() {
    try {
        const [statusRes, msgRes] = await Promise.all([
            duet.get("/rr_model?key=state.status"),
            duet.get("/rr_model?key=state.messageBox")
        ]);
        return {
            status: statusRes.data.result, 
            messageBox: msgRes.data.result 
        };
    } catch (err) {
        console.error(`❌ Duet Offline (${PRINTER_IP}):`, err.message);
        return null;
    }
}

/* ================= MAIN POLL LOOP ================= */

async function poll() {
    if (pollLock) return; 
    pollLock = true;

    try {
        const data = await getPrinterData();
        if (!data) return; 

        const { status, messageBox } = data;
        const isIdle = status === "idle";
        const messageIsNull = messageBox == null;

        console.log(`[${new Date().toLocaleTimeString()}] Internal: ${state.state} | Printer: ${status} | Msg: ${messageIsNull ? 'Empty' : 'ACTIVE'}`);

        /* PI STATE LOGIC MAPPED TO MONGODB STATUS:
           0: Busy/Printing (DB: printing)
           1: Idle/Scanning (DB: looking for "queued" or "printing" to close)
           2: Pending (Atomic Lock - Backend request in progress)
           3: Interaction (DB: ready - waiting for user M291 click)
        */

        // 1. HANDLE PRINTER BUSY
        if (!isIdle) {
            // Ignore "busy" status if we are simply waiting for a user to click the message box
            const processingMessage = (state.state === 3 && !messageIsNull);

            if (!processingMessage && state.state !== 0) {
                console.log("🔄 Printer is active. Syncing state to 0 (Printing).");
                state.state = 0;
                saveState(state);
            }
            return;
        }

        // 2. PRINTER IS IDLE - LOGIC ENGINE
        
        // From Busy -> Scanning (Triggered when print finishes)
        if (state.state === 0) {
            console.log("🏁 Printer reached idle. Moving to Scan state.");
            state.state = 1;
            saveState(state);
        }

        // State 1: Ready to call /jobs/ready
        if (state.state === 1) {
            console.log("🔍 Checking backend (Finalizing previous / Finding next)...");
            
            // LOCK: Move to state 2 BEFORE the await
            state.state = 2;
            saveState(state);

            try {
                // Backend: Sets "printing" -> "completed" AND "queued" -> "ready"
                const res = await axios.get(`${BACKEND_URL}/jobs/${PRINTER_IP}/ready`);
                
                if (res.status === 200 && res.data.jobFound) {
                    console.log("✅ Job found and set to 'ready'. Interaction required.");
                    state.state = 3;
                } else {
                    console.log("💤 No new jobs. Staying in Scan state.");
                    state.state = 1; 
                }
            } catch (err) {
                console.error("⚠️ Backend scan failed:", err.message);
                state.state = 1; // Revert to retry
            }
            saveState(state);
            return;
        }

        // State 3: Interaction (Waiting for user)
        if (state.state === 3) {
            if (messageIsNull) {
                console.log("🔘 Message cleared! Moving from 'ready' to 'printing'...");
                
                // Set to Pending again to lock the /send request
                state.state = 2;
                saveState(state);

                try {
                    // Backend: Sets "ready" -> "printing" and uploads file
                    const sendRes = await axios.get(`${BACKEND_URL}/jobs/${PRINTER_IP}/send`);
                    if (sendRes.status === 200) {
                        console.log("🚀 G-code sent. Job status: printing.");
                        state.state = 0; 
                    } else {
                        state.state = 1; 
                    }
                } catch (err) {
                    console.error("❌ Send error:", err.message);
                    state.state = 1; 
                }
                saveState(state);
            } else {
                console.log("⏳ User interaction required at printer.");
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