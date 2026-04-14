import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const API = "https://salus-it500.com/public";

// IMPORTANT: setează emailul și parola în Render → Environment Variables
const SALUS_EMAIL = process.env.SALUS_EMAIL || "";
const SALUS_PASSWORD = process.env.SALUS_PASSWORD || "";

let PHPSESSID = ""; // cookie-ul de sesiune

const app = express();
app.use(cors());
app.use(express.json());

// ---------------- LOGIN ----------------

async function salusLogin() {
    // 1. GET login page → obținem cookie PHPSESSID
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

    // 2. POST login cu email + parolă
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

// ---------------- GET DATA ----------------

async function getSalusData() {
    if (!PHPSESSID) {
        throw new Error("Nu există sesiune activă — trebuie login");
    }

    const resp = await fetch(`${API}/devices.php`, {
        method: "GET",
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Cookie": PHPSESSID
        }
    });

    const html = await resp.text();
    const $ = cheerio.load(html);

    const devices: any[] = [];

    $("table.deviceTable tr").each((i, row) => {
        const cols = $(row).find("td");
        if (cols.length > 0) {
            devices.push({
                name: $(cols[0]).text().trim(),
                temp: $(cols[1]).text().trim(),
                setpoint: $(cols[2]).text().trim(),
                mode: $(cols[3]).text().trim()
            });
        }
    });

    return devices;
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
        const data = await getSalusData();
        res.json({ status: "ok", data });
    } catch (err: any) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

// ---------------- SERVER ----------------

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Salus backend running on port ${PORT}`);
});
