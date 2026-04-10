import expressPkg from "express";
const express = expressPkg;
type Request = expressPkg.Request;
type Response = expressPkg.Response;

import cors from "cors";
import fetch from "node-fetch";

const API = "https://salus-it500.com/public";

// ⚠️ Pune aici emailul și parola de la iT500
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

  const data: any = await res.json();
  if (!data.success) {
    console.error("Salus login failed:", data);
    throw new Error("iT500 login failed");
  }

  return data.session;
}

app.get("/salus/data", async (req: Request, res: Response): Promise<void> => {
  try {
    const session = await loginIT500();
    const r = await fetch(`${API}/getdata.php?session=${session}`);
    const data: any = await r.json();

    res.json({
      currentTemp: data.temp,
      setTemp: data.setTemp,
      heatingOn: data.heatOn === 1,
      mode: data.mode,
    });
  } catch (err) {
    console.error("Error in /salus/data:", err);
    res.status(500).json({ error: "Failed to fetch Salus data" });
  }
});

app.post("/salus/settemp", async (req: Request, res: Response): Promise<void> => {
  try {
    const { temp } = req.body as { temp: number };

    if (typeof temp !== "number") {
      res.status(400).json({ error: "temp must be a number" });
      return;
    }

    const session = await loginIT500();
    await fetch(`${API}/settemp.php?session=${session}&temp=${temp}`);

    res.json({ success: true });
  } catch (err) {
    console.error("Error in /salus/settemp:", err);
    res.status(500).json({ error: "Failed to set temperature" });
  }
});

app.post("/salus/setmode", async (req: Request, res: Response): Promise<void> => {
  try {
    const { mode } = req.body as { mode: "auto" | "manual" | "off" };

    if (!["auto", "manual", "off"].includes(mode)) {
      res.status(400).json({ error: "invalid mode" });
      return;
    }

    const session = await loginIT500();
    await fetch(`${API}/setmode.php?session=${session}&mode=${mode}`);

    res.json({ success: true });
  } catch (err) {
    console.error("Error in /salus/setmode:", err);
    res.status(500).json({ error: "Failed to set mode" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("Salus backend running on port", PORT);
});
