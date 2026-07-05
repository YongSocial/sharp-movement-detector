import cors from "cors";
import express from "express";
import { CONFIG } from "../src/config.js";
import { loadCredentials } from "../src/tokenStore.js";
import { streamWithReconnect } from "../src/sseClient.js";
import { normalizeOddsEvent, processOddsUpdate } from "../src/detector.js";
import { resolvePendingFixtures } from "../src/resolver.js";
import { resolveFixtureName } from "../src/fixtureNames.js";
import { recentSignals, accuracyStats, getFixtureName } from "../src/db.js";

const seenFixtures = new Set();
const RESOLVE_INTERVAL_MS = 60_000;

function startApi() {
  const app = express();
  app.use(cors());

  app.get("/api/signals", async (_req, res) => {
    try {
      const rows = await recentSignals.all({ limit: 500 });
      const enriched = await Promise.all(
        rows.map(async (row) => {
          const fx = await getFixtureName.get({ fixture_id: row.fixture_id });
          return { ...row, fixture_name: fx?.name ?? null, competition: fx?.competition ?? null };
        })
      );
      res.json(enriched);
    } catch (err) {
      console.error("[api] /api/signals failed:", err.message);
      res.status(500).json({ error: "internal error" });
    }
  });

  app.get("/api/stats", async (_req, res) => {
    try {
      res.json(await accuracyStats.get());
    } catch (err) {
      console.error("[api] /api/stats failed:", err.message);
      res.status(500).json({ error: "internal error" });
    }
  });

  app.get("/health", (_req, res) => res.json({ ok: true, network: CONFIG.network }));

  const PORT = process.env.PORT || CONFIG.port;
  app.listen(PORT, () => console.log(`[api] listening on :${PORT}`));
}

async function startAgent() {
  const creds = loadCredentials();
  console.log(`[agent] starting on ${creds.network}`);

  setInterval(async () => {
    try {
      await resolvePendingFixtures(creds);
    } catch (err) {
      console.error("[agent] resolver tick failed:", err.message);
    }
  }, RESOLVE_INTERVAL_MS);

  await streamWithReconnect({
    url: `${CONFIG.apiBaseUrl}/odds/stream`,
    jwt: creds.jwt,
    apiToken: creds.apiToken,
    onStatus: (status, err) => {
      if (status === "error") console.error("[agent] stream error, reconnecting:", err?.message);
      else console.log(`[agent] stream ${status}`);
    },
    onMessage: async (event, data) => {
      if (event !== "odds" && event !== "message") return;
      for (const update of normalizeOddsEvent(data)) {
        if (!seenFixtures.has(update.fixture_id)) {
          seenFixtures.add(update.fixture_id);
          resolveFixtureName(update.fixture_id, creds).catch(() => {});
        }
        try {
          const signal = await processOddsUpdate(update);
          if (signal) {
            console.log(
              `[SHARP MOVE] fixture=${signal.fixture_id} ${signal.market}/${signal.selection} ` +
                `${signal.prev_price.toFixed(2)} -> ${signal.new_price.toFixed(2)} (${signal.direction})`
            );
          }
        } catch (err) {
          console.error("[agent] processOddsUpdate failed:", err.message);
        }
      }
    },
  });
}

startApi();
startAgent().catch((err) => {
  console.error("[agent] fatal:", err);
});
