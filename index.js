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

        console.log(
            `[${new Date().toLocaleTimeString()}] Internal: ${state.state} | Printer: ${status} | Msg: ${messageIsNull ? "Empty" : "ACTIVE"}`
        );

        /* PI STATE LOGIC MAPPED TO MONGODB STATUS:
           0: Busy/Printing (DB: printing)
           1: Idle/Scanning (DB: looking for "queued" or "printing" to close)
           2: Pending (Atomic Lock - Backend request in progress)
           3: Interaction (DB: ready - waiting for user M291 click)
        */

        // 1. HANDLE PRINTER BUSY
        if (!isIdle) {
            // ONLY sync to State 0 if we aren't currently waiting for a message (3)
            // OR currently waiting for a backend response (2).
            const isTransitioning = (state.state === 2 || state.state === 3);

            if (!isTransitioning && state.state !== 0) {
                console.log("🔄 Printer is active (and not in transition). Syncing state to 0.");
                state.state = 0;
                saveState(state);
            }
            return;
        }

        // 2. PRINTER IS IDLE - LOGIC ENGINE

        // Transition: Busy -> Scanning (Job finished or Pi just woke up)
        if (state.state === 0) {
            console.log("🏁 Printer reached idle. Moving to Scan state.");
            state.state = 1;
            saveState(state);
        }

        // State 1: Ready to call /jobs/ready
        if (state.state === 1) {
            console.log("🔍 Checking backend (Finalizing previous / Finding next)...");

            state.state = 2; // LOCK: Enter Pending
            saveState(state);

            try {
                const res = await axios.get(`${BACKEND_URL}/jobs/${PRINTER_IP}/ready`);

                // If backend finds a job that is 'queued' (and flips it) OR already 'ready'
                if (res.status === 200 && res.data.jobFound) {
                    console.log(`✅ Job found (Status: ${res.data.status}). Moving to Interaction.`);
                    state.state = 3; 
                } else {
                    console.log("💤 No jobs found. Staying in Scan state.");
                    state.state = 1;
                }
            } catch (err) {
                console.error("⚠️ Backend scan failed:", err.message);
                state.state = 1; // Unlock to allow retry
            }
            saveState(state);
            return;
        }

        // State 3: Interaction (User must clear bed and click 'OK')
        if (state.state === 3) {
            if (messageIsNull) {
                console.log("🔘 Message cleared by user! LOCKING and triggering G-code upload...");
                
                // LOCK: Move back to Pending (State 2) so no other poll cycle triggers /send
                state.state = 2; 
                saveState(state);

                try {
                    const sendRes = await axios.get(`${BACKEND_URL}/jobs/${PRINTER_IP}/send`);
                    
                    if (sendRes.status === 200) {
                        console.log("🚀 Job successfully sent! Duet should be busy soon.");
                        state.state = 0; // Success -> Busy
                    } else {
                        console.warn("⚠️ Backend didn't start print. Re-checking status...");
                        state.state = 1; // Unexpected response, revert to scan
                    }
                } catch (err) {
                    console.error("❌ Failed to send job:", err.message);
                    // CRITICAL: Stay in State 3. If it was a network timeout, 
                    // we want to try /send again next poll, not restart the scan.
                    state.state = 3; 
                }
                saveState(state);
            } else {
                console.log("⏳ Waiting for user to clear bed and click 'OK'...");
            }
            return; 
        }

    } catch (globalErr) {
        console.error("Critical Poll Error:", globalErr);
    } finally {
        pollLock = false;
    }
}

console.log(`🟢 Duet Pi Agent active for ${PRINTER_IP}`);
setInterval(poll, Number(POLL_INTERVAL_MS));