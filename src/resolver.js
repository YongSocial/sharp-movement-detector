import axios from "axios";
import { CONFIG } from "./config.js";
import { getUnresolvedSignalsForFixture, resolveSignalsForFixture } from "./db.js";

function httpClient(creds) {
  return axios.create({
    timeout: 15000,
    baseURL: CONFIG.apiOrigin,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.jwt}`,
      "X-Api-Token": creds.apiToken,
    },
  });
}

// Maps a TxLINE scores snapshot to a simple outcome label ("home" | "draw" | "away").
// Adjust to the real scores schema (documentation/scores/soccer-feed) once validated
// against live payloads.
function deriveOutcome(scoreEntries) {
  if (!scoreEntries?.length) return null;
  const final = scoreEntries[scoreEntries.length - 1];
  const homeScore = final.HomeScore ?? final.homeScore;
  const awayScore = final.AwayScore ?? final.awayScore;
  const isFinal = final.GameState === "FINAL" || final.gameState === "FINAL";
  if (!isFinal || homeScore == null || awayScore == null) return null;

  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "draw";
}

/**
 * Polls scores for every fixture that still has unresolved signals and,
 * once a fixture is final, records whether each flagged signal correctly
 * anticipated the outcome.
 */
export async function resolvePendingFixtures(creds) {
  const client = httpClient(creds);
  const pending = getUnresolvedSignalsForFixture.all();

  let resolvedCount = 0;

  for (const { fixture_id } of pending) {
    try {
      const { data } = await client.get(`/api/scores/snapshot/${fixture_id}`);
      const outcome = deriveOutcome(data);
      if (!outcome) continue;

      resolveSignalsForFixture.run({ fixture_id, outcome });
      resolvedCount += 1;
      console.log(`[resolver] fixture ${fixture_id} final -> ${outcome}`);
    } catch (err) {
      console.warn(`[resolver] failed to check fixture ${fixture_id}:`, err.message);
    }
  }

  return resolvedCount;
}
