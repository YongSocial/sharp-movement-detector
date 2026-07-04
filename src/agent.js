import { CONFIG } from "./config.js";
import { loadCredentials } from "./tokenStore.js";
import { streamWithReconnect } from "./sseClient.js";
import { normalizeOddsEvent, processOddsUpdate } from "./detector.js";
import { resolvePendingFixtures } from "./resolver.js";

const RESOLVE_INTERVAL_MS = 60_000; // check for finished fixtures once a minute

async function main() {
  const creds = loadCredentials();
  console.log(`[agent] starting on ${creds.network}, thresholds: ` +
    `Δ>=${CONFIG.moveThreshold} or ${(CONFIG.moveThresholdPct * 100).toFixed(1)}%`);

  // Background loop: resolve outcomes for fixtures that have finished.
  setInterval(async () => {
    try {
      await resolvePendingFixtures(creds);
    } catch (err) {
      console.error("[agent] resolver tick failed:", err.message);
    }
  }, RESOLVE_INTERVAL_MS);

  const streamUrl = `${CONFIG.apiBaseUrl}/odds/stream`;

  await streamWithReconnect({
    url: streamUrl,
    jwt: creds.jwt,
    apiToken: creds.apiToken,
    onStatus: (status, err) => {
      if (status === "error") {
        console.error(`[agent] stream error, reconnecting:`, err?.message);
      } else {
        console.log(`[agent] stream ${status}`);
      }
    },
    onMessage: (event, data) => {
      if (event !== "odds" && event !== "message") return;

      const updates = normalizeOddsEvent(data);
      for (const update of updates) {
        const signal = processOddsUpdate(update);
        if (signal) {
          const pct = (signal.delta_pct * 100).toFixed(1);
          console.log(
            `[SHARP MOVE] fixture=${signal.fixture_id} ${signal.market}/${signal.selection} ` +
              `${signal.prev_price.toFixed(2)} -> ${signal.new_price.toFixed(2)} ` +
              `(${signal.direction}, ${pct}%) via ${signal.bookmaker}`
          );
        }
      }
    },
  });
}

main().catch((err) => {
  console.error("[agent] fatal:", err);
  process.exit(1);
});
