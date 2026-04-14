import expressPkg from "express";
const express = expressPkg;
type Request = expressPkg.Request;
type Response = expressPkg.Response;

import cors from "cors";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const API = "https://salus-it500.com/public";

const SALUS_EMAIL = "samuelcristian18@gmail.com";
const SALUS_PASSWORD = "Parolatermostat1";

const app = express();
app.use(cors());
app.use(express.json());

async function salusLogin(): Promise<{ session: string; cookies: string }> {
  // 1️⃣ Preluăm pagina de login pentru a extrage token-ul CSRF + cookie PHPSESSID
  const loginPage = await fetch(`${API}/login.php`, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "text/html",
    },
  });

  const setCookie = loginPage.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];

  const html = await loginPage.text();

  // 🔥 LOG COMPLET AL PAGINII DE LOGIN — AICI VEDEM CE TRIMITE SALUS
  console.log("=== RAW LOGIN PAGE START ===");
  console.log(html);
  console.log("=== RAW LOGIN PAGE END ===");

  const $ = cheerio.load(html);

  // 2️⃣ Extragem token-ul CSRF (dacă există)
  const csrf = $('input[name="token"]').attr("value") || "";

  if (!csrf) {
    throw new Error("Nu am găsit token CSRF în pagina de login");
  }

  // 3️⃣ Trimitem login-ul real, exact ca browserul
  const body = new URLSearchParams();
  body.append("email", SALUS_EMAIL);
  body.append("password", SALUS_PASSWORD);
  body.append("keep_logged_in", "1");
  body.append("login", "Login");
  body.append("token", csrf);

  const loginRes = await fetch(`${API}/login.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": cookie,
      "User-Agent": "Mozilla/5.0",
    },
    body,
    redirect: "manual",
  });

  const cookies2 = loginRes.headers.get("set-cookie") || "";
  const finalCookie = cookies2.split(";")[0] || cookie;

  // 4️⃣ Verificăm dacă login-ul a reușit
  if (loginRes.status === 302) {
    const location = loginRes.headers.get("location") || "";
    if (!location.includes("devices.php")) {
      throw new Error("Login Salus nereușit (redirect greșit)");
    }
  } else {
    throw new Error("Login Salus nereușit (status != 302)");
  }

  // 5️⃣ Preluăm sesiunea reală
  const sessionMatch = finalCookie.match(/PHPSESSID=([^;]+)/);
  if (!sessionMatch) {
    throw new Error("Nu am găsit sesiunea PHPSESSID");
  }

  return {
    session: sessionMatch[1],
    cookies: finalCookie,
  };
}

async function salusGetData() {
  const { session, cookies } = await salusLogin();

  const res = await fetch(`${API}/getdata.php?session=${session}`, {
    headers: {
      "Cookie": cookies,
      "User-Agent": "Mozilla/5.0",
    },
  });

  const raw = await res.text();

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Salus a returnat NON-JSON la getdata");
  }
}

app.get("/salus/data", async (req: Request, res: Response) => {
  try {
    const data = await salusGetData();

    res.json({
      currentTemp: data.temp,
      setTemp: data.setTemp,
      heatingOn: data.heatOn === 1,
      mode: data.mode,
    });
  } catch (err) {
    console.error("Eroare /salus/data:", err);
    res.status(500).json({ error: "Failed to fetch Salus data" });
  }
});

app.post("/salus/settemp", async (req: Request, res: Response) => {
  try {
    const { temp } = req.body;
    if (typeof temp !== "number") {
      return res.status(400).json({ error: "temp must be a number" });
    }

    const { session, cookies } = await salusLogin();

    await fetch(`${API}/settemp.php?session=${session}&temp=${temp}`, {
      headers: {
        "Cookie": cookies,
        "User-Agent": "Mozilla/5.0",
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Eroare /salus/settemp:", err);
    res.status(500).json({ error: "Failed to set temperature" });
  }
});

app.post("/salus/setmode", async (req: Request, res: Response) => {
  try {
    const { mode } = req.body;
    if (!["auto", "manual", "off"].includes(mode)) {
      return res.status(400).json({ error: "invalid mode" });
    }

    const { session, cookies } = await salusLogin();

    await fetch(`${API}/setmode.php?session=${session}&mode=${mode}`, {
      headers: {
        "Cookie": cookies,
        "User-Agent": "Mozilla/5.0",
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Eroare /salus/setmode:", err);
    res.status(500).json({ error: "Failed to set mode" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("🟢 Salus backend running on port", PORT);
});
