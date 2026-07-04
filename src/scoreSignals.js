// Run outcome resolution once, on demand (useful right after matches end,
// or in a cron job separate from the long-running stream agent).
import { loadCredentials } from "./tokenStore.js";
import { resolvePendingFixtures } from "./resolver.js";
import { accuracyStats } from "./db.js";

async function main() {
  const creds = loadCredentials();
  const resolved = await resolvePendingFixtures(creds);
  console.log(`[score] resolved ${resolved} fixture(s) this run.`);
  console.log(accuracyStats.get());
}

main().catch((err) => {
  console.error("[score] failed:", err);
  process.exit(1);
});
