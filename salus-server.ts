import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const API = "https://salus-it500.com/public";

const SALUS_EMAIL = process.env.SALUS_EMAIL || "";
const SALUS_PASSWORD = process.env.SALUS_PASSWORD || "";

// ID-ul real al device-ului tău
const DEVICE_ID = "33610733";

let PHPSESSID = "";

const app = express();
app.use(cors());
app.use(express.json());

// ---------------- LOGIN ----------------

async function salusLogin() {
    const loginPage = await fetch(`${API}/login.php`, {
        method: "GET",
        headers: { "User-Agent": "Mozilla/5.0" }
    });

    const setCookie = loginPage.headers.get("set-cookie") || "";
    const cookie = setCookie.split(";")[0];

    if (!cookie.includes("PHPSESSID")) {
        throw new Error("Nu am primit cookie PHPSESSID");
    }

    PHPSESSID = cookie;

    const body = new URLSearchParams();
    body.append("IDemail", SALUS_EMAIL);
    body.append("Password", SALUS_PASSWORD);

    const loginResp = await fetch(`${API}/login.php`, {
        method: "POST",
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": PHPSESSID
        },
        body
    });

    const html = await loginResp.text();
    if (html.includes("Login failed") || html.includes("incorrect")) {
        throw new Error("Login Salus eșuat");
    }

    return true;
}

// ---------------- CONTROL PAGE ----------------

async function getControlPageHtml() {
    const resp = await fetch(`${API}/control.php?devId=${DEVICE_ID}`, {
        method: "GET",
        headers: { "User-Agent": "Mozilla/5.0", "Cookie": PHPSESSID }
    });

    return resp.text();
}

// ---------------- PARSER ----------------

function parseControlPage(html: string) {
    const $ = cheerio.load(html);

    // temperatura actuală
    const temp = Number($("#current_room_tempZ1").text().trim()) || null;

    // setpoint
    const setpoint = Number($("#current_tempZ1").text().trim()) || null;

    // textul complet: "HEATING AUTO"
    const modeText = $(".heatingNote").text().trim().toUpperCase();

    let status = null;
    let mode = null;

    if (modeText.includes("HEATING")) status = "HEATING";
    if (modeText.includes("OFF")) status = "OFF";

    if (modeText.includes("AUTO")) mode = "AUTO";
    if (modeText.includes("MANUAL")) mode = "MANUAL";

    return { temp, setpoint, mode, status };
}

// ---------------- ROUTES ----------------

app.post("/salus/login", async (req, res) => {
    try {
        await salusLogin();
        res.json({ status: "ok", message: "Logged in" });
    } catch (err: any) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

app.get("/salus/data", async (req, res) => {
    try {
        // DEBUG 1 → devices.php
        if (req.query.debug === "1") {
            const resp = await fetch(`${API}/devices.php`, {
                method: "GET",
                headers: { "User-Agent": "Mozilla/5.0", "Cookie": PHPSESSID }
            });
            return res.send(await resp.text());
        }

        // DEBUG 2 → control.php
        if (req.query.debug === "2") {
            const html = await getControlPageHtml();
            return res.send(html);
        }

        // Normal mode
        const html = await getControlPageHtml();
        const data = parseControlPage(html);

        res.json({
            status: "ok",
            deviceId: DEVICE_ID,
            data
        });

    } catch (err: any) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

// ---------------- SERVER ----------------

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Salus backend running on port ${PORT}`);
});
