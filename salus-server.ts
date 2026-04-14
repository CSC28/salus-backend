// salus-server.ts

import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const API_PUBLIC = "https://salus-it500.com/public";
const API_ROOT = "https://salus-it500.com";

const SALUS_EMAIL = process.env.SALUS_EMAIL || "";
const SALUS_PASSWORD = process.env.SALUS_PASSWORD || "";
const DEVICE_ID = "33610733";

let PHPSESSID = "";
let TOKEN: string | null = null;

const app = express();
app.use(cors());
app.use(express.json());

// ---------------- UTILS ----------------

function getCookieHeader() {
  if (!PHPSESSID) return {};
  return { Cookie: PHPSESSID };
}

// ---------------- LOGIN + TOKEN ----------------

async function salusLogin(): Promise<void> {
  // 1. GET login.php → luăm PHPSESSID
  const loginPage = await fetch(`${API_PUBLIC}/login.php`, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://salus-it500.com/public/login.php",
      "Origin": "https://salus-it500.com",
    },
  });

  const setCookie = loginPage.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];

  if (!cookie.includes("PHPSESSID")) {
    throw new Error("Nu am primit cookie PHPSESSID de la Salus");
  }

  PHPSESSID = cookie;

  // 2. POST login.php → autentificare
  const body = new URLSearchParams();
  body.append("IDemail", SALUS_EMAIL);
  body.append("password", SALUS_PASSWORD); // <-- corect
  body.append("login", "Login");
  body.append("keep_logged_in", "1");

  const loginResp = await fetch(`${API_PUBLIC}/login.php`, {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://salus-it500.com/public/login.php",
      "Origin": "https://salus-it500.com",
      Cookie: PHPSESSID,
    },
    body,
  });

  const html = await loginResp.text();

  if (html.includes("IDemail") && html.includes("password")) {
    throw new Error("Login Salus eșuat — pagina de login a fost returnată din nou");
  }

  TOKEN = null;
}

async function fetchControlPageRaw(): Promise<string> {
  const resp = await fetch(`${API_PUBLIC}/control.php?devId=${DEVICE_ID}`, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://salus-it500.com/public/devices.php",
      "Origin": "https://salus-it500.com",
      ...getCookieHeader(),
    },
  });

  return resp.text();
}

function extractTokenFromHtml(html: string): string | null {
  const $ = cheerio.load(html);
  const token = $("#token").attr("value") || $("#token").val() || null;
  return token ? String(token) : null;
}

async function ensureLoggedInAndToken(): Promise<void> {
  if (!PHPSESSID) {
    await salusLogin();
  }

  if (!TOKEN) {
    const html = await fetchControlPageRaw();
    const token = extractTokenFromHtml(html);
    if (!token) {
      throw new Error("Nu am putut extrage token-ul din control.php");
    }
    TOKEN = token;
  }
}

async function fetchControlPageWithToken(): Promise<string> {
  await ensureLoggedInAndToken();

  const url = `${API_PUBLIC}/control.php?devId=${DEVICE_ID}&token=${TOKEN}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://salus-it500.com/public/devices.php",
      "Origin": "https://salus-it500.com",
      ...getCookieHeader(),
    },
  });

  return resp.text();
}

// ---------------- PARSER (REPARAT) ----------------

function parseZones(html: string) {
  const $ = cheerio.load(html);
  const raw = $("body").text().toUpperCase();

  // ZONA 1
  const z1Temp = Number($("#current_room_tempZ1").text().trim()) || null;
  const z1Setpoint = Number($("#current_tempZ1").text().trim()) || null;

  const z1Status =
    raw.includes("ZONE 1") && raw.includes("HEATING")
      ? "HEATING"
      : raw.includes("ZONE 1") && raw.includes("OFF")
      ? "OFF"
      : null;

  const z1Mode = raw.includes("AUTO")
    ? "AUTO"
    : raw.includes("MANUAL")
    ? "MANUAL"
    : null;

  // ZONA 2
  const z2Temp = Number($("#current_room_tempZ2").text().trim()) || null;
  const z2Setpoint = Number($("#current_tempZ2").text().trim()) || null;

  const z2Status =
    raw.includes("ZONE 2") && raw.includes("HEATING")
      ? "HEATING"
      : raw.includes("ZONE 2") && raw.includes("OFF")
      ? "OFF"
      : null;

  return {
    zone1: {
      temp: z1Temp,
      setpoint: z1Setpoint,
      mode: z1Mode,
      status: z1Status,
    },
    zone2: {
      temp: z2Temp,
      setpoint: z2Setpoint,
      status: z2Status,
    },
  };
}

// ---------------- CONTROL ----------------

async function sendSetCommand(set_f: string, value: string): Promise<void> {
  await ensureLoggedInAndToken();

  const body = new URLSearchParams();
  body.append("devId", DEVICE_ID);
  body.append("set_f", set_f);
  body.append("value", value);

  const resp = await fetch(`${API_ROOT}/includes/set.php`, {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://salus-it500.com/public/control.php",
      "Origin": "https://salus-it500.com",
      ...getCookieHeader(),
    },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`set.php a răspuns cu status ${resp.status}: ${text}`);
  }
}

// ---------------- ROUTES ----------------

app.post("/salus/login", async (req, res) => {
  try {
    await salusLogin();
    await ensureLoggedInAndToken();
    res.json({ status: "ok", message: "Logged in + token ready" });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.get("/salus/data", async (req, res) => {
  try {
    const debug = req.query.debug;

    if (debug === "1") {
      await ensureLoggedInAndToken();
      const resp = await fetch(`${API_PUBLIC}/devices.php`, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0",
          ...getCookieHeader(),
        },
      });
      const html = await resp.text();
      return res.send(html);
    }

    if (debug === "2") {
      const html = await fetchControlPageWithToken();
      return res.send(html);
    }

    const html = await fetchControlPageWithToken();
    const zones = parseZones(html);

    res.json({
      status: "ok",
      deviceId: DEVICE_ID,
      ...zones,
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/salus/set-temp", async (req, res) => {
  try {
    const { temp } = req.body as { temp?: number };
    if (typeof temp !== "number") {
      return res
        .status(400)
        .json({ status: "error", message: "temp trebuie să fie number" });
    }

    const value = temp.toFixed(1);
    await sendSetCommand("2", value);

    res.json({ status: "ok", message: "Temperatură setată", temp });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/salus/set-mode", async (req, res) => {
  try {
    const { mode } = req.body as { mode?: string };
    if (!mode || !["AUTO", "OFF"].includes(mode.toUpperCase())) {
      return res.status(400).json({
        status: "error",
        message: 'mode trebuie să fie "AUTO" sau "OFF"',
      });
    }

    const upper = mode.toUpperCase();
    const value = upper === "AUTO" ? "0" : "1";

    await sendSetCommand("3", value);

    res.json({ status: "ok", message: "Mod setat", mode: upper });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/salus/off", async (req, res) => {
  try {
    await sendSetCommand("3", "1");
    res.json({ status: "ok", message: "Mod OFF setat" });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/salus/auto", async (req, res) => {
  try {
    await sendSetCommand("3", "0");
    res.json({ status: "ok", message: "Mod AUTO setat" });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ---------------- SERVER ----------------

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Salus backend running on port ${PORT}`);
});
