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

// ---------------- DEVICE PAGE ----------------

async function getControlPageHtml() {
    const resp = await fetch(`${API}/control.php?devId=${DEVICE_ID}`, {
        method: "GET",
        headers: { "User-Agent": "Mozilla/5.0", "Cookie": PHPSESSID }
    });

    return resp.text();
}

function parseControlPage(html: string) {
    const $ = cheerio.load(html);

    // temperatura actuală
    const tempText = $("body").text().match(/CURRENT TEMPERATURE:\s*([\d.]+)°C/);
    const temp = tempText ? Number(tempText[1]) : null;

    // setpoint (din tabel sau text)
    const setpointText = $("body").text().match(/Program\s*\d+\s*\|\s*[\d:]+\s*\|\s*([\d.]+)°C/);
    const setpoint = setpointText ? Number(setpointText[1]) : null;

    // modul
    let mode = null;
    if (html.includes("AUTO")) mode = "AUTO";
    if (html.includes("OFF")) mode = "OFF";

    // status
    let status = null;
    if (html.includes("HEATING")) status = "HEATING";
    if (html.includes("OFF")) status = "OFF";

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
        const html = await getControlPageHtml();

        if (req.query.debug === "1") return res.send(html);

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
