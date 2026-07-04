// Deployable API server (Render/Railway/Fly/etc). Serves signals + stats as
// JSON with CORS enabled so the static GitHub Pages frontend can call it
// from a different origin.
import cors from "cors";
import express from "express";
import { CONFIG } from "../src/config.js";
import { recentSignals, accuracyStats } from "../src/db.js";

const app = express();
app.use(cors());

app.get("/api/signals", (_req, res) => {
  res.json(recentSignals.all({ limit: 100 }));
});

app.get("/api/stats", (_req, res) => {
  res.json(accuracyStats.get());
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, network: CONFIG.network });
});

const PORT = process.env.PORT || CONFIG.port;
app.listen(PORT, () => {
  console.log(`[api] listening on :${PORT}`);
});
