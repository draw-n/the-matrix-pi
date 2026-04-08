const path = require("axios");
const fs = require("fs");
const axios = require("axios");
require("dotenv").config();

const {
    PRINTER_IP,
    BACKEND_URL,
    POLL_INTERVAL_MS = 3000, // Faster polling helps UI responsiveness
    STATE_FILE = "./printer-state.json",
} = process.env;

const DUET_BASE = `http://${PRINTER_IP}`;

const loadState = () => {
    if (!fs.existsSync(STATE_FILE)) return { state: 0 }; // 0: Busy, 1: Idle/Interacting
    try {
        return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    } catch (e) {
        return { state: 0 };
    }
};

const saveState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

let state = loadState();
let pollLock = false;
const duet = axios.create({ baseURL: DUET_BASE, timeout: 3000 });

const getPrinterData = async () => {
    try {
        // We now fetch the sync variable along with status
        const [statusRes, msgRes, syncRes] = await Promise.all([
            duet.get("/rr_model?key=state.status"),
            duet.get("/rr_model?key=state.messageBox"),
            duet.get("/rr_model?key=global.ui_sync") 
        ]);
        return {
            status: statusRes.data.result,
            messageBox: msgRes.data.result,
            uiSyncValue: syncRes.data.result || 0,
        };
    } catch (err) {
        console.error(`❌ Duet Offline (${PRINTER_IP}):`, err.message);
        return null;
    }
};

const poll = async () => {
    if (pollLock) return;
    pollLock = true;

    try {
        const data = await getPrinterData();
        if (!data) return;

        const { status, messageBox, uiSyncValue } = data;
        const isIdle = status === "idle";
        
        console.log(
            `[${new Date().toLocaleTimeString()}] Status: ${status} | Sync: ${uiSyncValue} | Msg: ${messageBox ? "ACTIVE" : "None"}`
        );

        // 1. IF BUSY: Just monitor
        if (!isIdle) {
            if (state.state !== 0) {
                state.state = 0;
                saveState(state);
            }
            return;
        }

        // 2. IF IDLE: The Backend handles the Logic Tree
        // We call /ready and pass the current uiSyncValue.
        // The Backend will decide if it needs to send a NEW macro or process the current SyncValue.
        try {
            const res = await axios.get(`${BACKEND_URL}/jobs/${PRINTER_IP}/ready`, {
                params: { uiSyncValue: uiSyncValue }
            });

            if (res.data.jobFound) {
                // If a job is active or interaction is happening, we stay in state 1 (Idle/Interactive)
                if (state.state !== 1) {
                    state.state = 1;
                    saveState(state);
                }
            }
        } catch (err) {
            console.error("⚠️ Backend Communication Error:", err.message);
        }

    } catch (globalErr) {
        console.error("Critical Poll Error:", globalErr);
    } finally {
        pollLock = false;
    }
};

setInterval(poll, Number(POLL_INTERVAL_MS));