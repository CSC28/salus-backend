import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const API = "https://salus-it500.com/public";

// Email și parolă din Render → Environment Variables
const SALUS_EMAIL = process.env.SALUS_EMAIL || "";
const SALUS_PASSWORD = process.env.SALUS_PASSWORD || "";

let PHPSESSID = ""; // cookie-ul de sesiune

const app = express();
app.use(cors());
app.use(express.json());

// ---------------- LOGIN ----------------

async function salusLogin() {
    const loginPage = await fetch(`${API}/login.php`, {
        method: "GET",
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept": "text/html",
        }
    });

    const setCookie = loginPage.headers.get("set-cookie") || "";
    const cookie = setCookie.split(";")[0];

    if (!cookie.includes("PHPSESSID")) {
        throw new Error("Nu am primit cookie PHPSESSID de la Salus");
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
        throw new Error("Login Salus eșuat — verifică email/parola");
    }

    return true;
}

// ---------------- GET DEVICE LIST ----------------

async function getDeviceListHtml() {
    const resp = await fetch(`${API}/devices.php`, {
        method: "GET",
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Cookie": PHPSESSID
        }
    });

    return resp.text();
}

function extractDeviceIds(html: string) {
    const $ = cheerio.load(html);
    const ids: string[] = [];

    $("div.deviceBox, div.device, img").each((i, el) => {
        const id = $(el).attr("alt") || $(el).text();
        if (id && id.trim().length > 5) {
            ids.push(id.trim());
        }
    });

    // fallback: extragem ID-ul din textul paginii
    const text = $("body").text();
    const matches = text.match(/STA\d+/g);
    if (matches) ids.push(...matches);

    return [...new Set(ids)];
}

// ---------------- GET DEVICE PAGE ----------------

async function getDevicePageHtml(deviceId: string) {
    const resp = await fetch(`${API}/device.php?id=${deviceId}`, {
        method: "GET",
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Cookie": PHPSESSID
        }
    });

    return resp.text();
}

// ---------------- PARSE DEVICE DATA ----------------

function parseDevicePage(html: string) {
    const $ = cheerio.load(html);

    const temp = $("#temperature, .temperature, .temp").first().text().trim();
    const setpoint = $("#setpoint, .setpoint").first().text().trim();
    const mode = $("#mode, .mode").first().text().trim();
    const status = $("#status, .status").first().text().trim();

    return {
        temp: temp || null,
        setpoint: setpoint || null,
        mode: mode || null,
        status: status || null
    };
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
        const listHtml = await getDeviceListHtml();

        if (req.query.debug === "1") {
            return res.send(listHtml);
        }

        const ids = extractDeviceIds(listHtml);
        if (ids.length === 0) {
            return res.json({ status: "ok", data: [], message: "Niciun device găsit" });
        }

        const deviceId = ids[0]; // primul device
        const deviceHtml = await getDevicePageHtml(deviceId);

        if (req.query.debug === "2") {
            return res.send(deviceHtml);
        }

        const data = parseDevicePage(deviceHtml);

        res.json({
            status: "ok",
            deviceId,
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
