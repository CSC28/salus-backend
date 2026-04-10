import expressPkg from "express";
const express = expressPkg;
type Request = expressPkg.Request;
type Response = expressPkg.Response;

import cors from "cors";
import fetch from "node-fetch";

const API = "https://salus-it500.com/public";

// ⚠️ Email + parolă Salus iT500
const SALUS_EMAIL = "samuelcristian18@gmail.com";
const SALUS_PASSWORD = "Parolatermostat1";

const app = express();
app.use(cors());
app.use(express.json());

async function loginIT500(): Promise<string> {
  const body = new URLSearchParams();
  body.append("username", SALUS_EMAIL);
  body.append("password", SALUS_PASSWORD);

  const res = await fetch(`${API}/login.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const raw = await res.text();
  console.log("🔵 Salus login raw response:", raw);

  // Dacă răspunsul nu este JSON, înseamnă că Salus a trimis HTML (blocare / redirect)
  try {
    const data = JSON.parse(raw);

    if (!data.success) {
      console.error("🔴 Salus login JSON error:", data);
      throw new Error("iT500 login failed (JSON error)");
    }

    console.log("🟢 Salus login OK, session:", data.session);
    return data.session;

  } catch (err) {
    console.error("🔴 Salus login returned NON-JSON (probabil HTML / blocare IP)");
    throw new Error("iT500 login returned non-JSON");
  }
}

app.get("/salus/data", async (req: Request, res: Response): Promise<void> => {
  try {
    const session = await loginIT500();

    const r = await fetch(`${API}/getdata.php?session=${session}`);
    const raw = await r.text();
    console.log("🔵 Salus getdata raw:", raw);

    const data = JSON.parse(raw);

    res.json({
      currentTemp: data.temp,
      setTemp: data.setTemp,
      heatingOn: data.heatOn === 1,
      mode: data.mode,
    });

  } catch (err) {
    console.error("🔴 Error in /salus/data:", err);
    res.status(500).json({ error: "Failed to fetch Salus data" });
  }
});

app.post("/salus/settemp", async (req: Request, res: Response): Promise<void> => {
  try {
    const { temp } = req.body;

    if (typeof temp !== "number") {
      res.status(400).json({ error: "temp must be a number" });
      return;
    }

    const session = await loginIT500();
    await fetch(`${API}/settemp.php?session=${session}&temp=${temp}`);

    res.json({ success: true });

  } catch (err) {
    console.error("🔴 Error in /salus/settemp:", err);
    res.status(500).json({ error: "Failed to set temperature" });
  }
});

app.post("/salus/setmode", async (req: Request, res: Response): Promise<void> => {
  try {
    const { mode } = req.body;

    if (!["auto", "manual", "off"].includes(mode)) {
      res.status(400).json({ error: "invalid mode" });
      return;
    }

    const session = await loginIT500();
    await fetch(`${API}/setmode.php?session=${session}&mode=${mode}`);

    res.json({ success: true });

  } catch (err) {
    console.error("🔴 Error in /salus/setmode:", err);
    res.status(500).json({ error: "Failed to set mode" });
  }
});

// Railway setează PORT automat
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("🟢 Salus backend running on port", PORT);
});
