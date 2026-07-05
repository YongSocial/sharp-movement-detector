// Runs the streaming agent and the HTTP API in a single process.
// Uses Supabase (Postgres) for persistent storage, so data survives
// Render free-tier restarts/sleeps.
import cors from "cors";
import express from "express";
import { CONFIG } from "../src/config.js";
import { loadCredentials } from "../src/tokenStore.js";
import { streamWithReconnect } from "../src/sseClient.js";
import { normalizeOddsEvent, processOddsUpdate } from "../src/detector.js";
import { resolvePendingFixtures } from "../src/resolver.js";
import { resolveFixtureName } from "../src/fixtureNames.js";
import { recentSignals, accuracyStats, getFixtureName, allSignals } from "../src/db.js";

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

  app.get("/api/aggregates", async (_req, res) => {
    try {
      const signals = await allSignals.all();
      const groups = {};

      for (const s of signals) {
        const k = `${s.fixture_id}::${s.market}::${s.selection}`;
        groups[k] ??= {
          fixture_id: s.fixture_id,
          market: s.market,
          selection: s.selection,
          netDelta: 0,
          count: 0,
          shortCount: 0,
          driftCount: 0,
          resolved: false,
          outcome: null,
          correctCount: 0,
          resolvedCount: 0,
          lastDetected: s.detected_at,
        };
        const g = groups[k];
        g.netDelta += s.direction === "shortening" ? -Math.abs(s.delta) : Math.abs(s.delta);
        g.count += 1;
        if (s.direction === "shortening") g.shortCount += 1;
        else g.driftCount += 1;
        if (s.detected_at > g.lastDetected) g.lastDetected = s.detected_at;
        if (s.resolved) {
          g.resolved = true;
          g.outcome = s.outcome;
          g.resolvedCount += 1;
          if (s.predicted_correctly) g.correctCount += 1;
        }
      }

      const result = Object.values(groups).map((g) => {
        const consistency = g.count ? Math.max(g.shortCount, g.driftCount) / g.count : 0;
        const netDirection = g.netDelta < 0 ? "shortening" : "drifting";
        return {
          fixture_id: g.fixture_id,
          market: g.market,
          selection: g.selection,
          net_delta: Math.round(g.netDelta * 100) / 100,
          net_direction: netDirection,
          signal_count: g.count,
          consistency: Math.round(consistency * 100),
          resolved: g.resolved,
          outcome: g.outcome,
          predicted_correctly: g.resolvedCount ? g.correctCount / g.resolvedCount >= 0.5 : null,
          last_detected: g.lastDetected,
        };
      });

      const fixtureNames = {};
      for (const r of result) {
        if (!(r.fixture_id in fixtureNames)) {
          const fx = await getFixtureName.get({ fixture_id: r.fixture_id });
          fixtureNames[r.fixture_id] = fx?.name ?? null;
        }
        r.fixture_name = fixtureNames[r.fixture_id];
      }

      res.json(result);
    } catch (err) {
      console.error("[api] /api/aggregates failed:", err.message);
      res.status(500).json({ error: "internal error" });
    }
  });

  app.get("/api/market-stats", async (_req, res) => {
    try {
      const signals = await allSignals.all();
      const bySelectionType = {};

      for (const s of signals) {
        if (!s.resolved) continue;
        const type = s.selection === "part1" ? "Home" : s.selection === "part2" ? "Away" : s.selection;
        bySelectionType[type] ??= { total: 0, correct: 0 };
        bySelectionType[type].total += 1;
        if (s.predicted_correctly) bySelectionType[type].correct += 1;
      }

      const result = Object.entries(bySelectionType).map(([selection, d]) => ({
        selection,
        total: d.total,
        correct: d.correct,
        win_rate: d.total ? Math.round((d.correct / d.total) * 1000) / 10 : null,
      }));

      res.json(result);
    } catch (err) {
      console.error("[api] /api/market-stats failed:", err.message);
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
