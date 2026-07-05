import axios from "axios";
import { CONFIG } from "./config.js";
import { getFixtureName, upsertFixtureName } from "./db.js";

let snapshotLoaded = false;
let loadingPromise = null;

async function loadFixturesSnapshot(creds) {
  const { data } = await axios.get(`${CONFIG.apiOrigin}/api/fixtures/snapshot`, {
    headers: {
      Authorization: `Bearer ${creds.jwt}`,
      "X-Api-Token": creds.apiToken,
    },
    timeout: 30000,
  });

  console.log("[fixtures] snapshot response type:", Array.isArray(data) ? `array(${data.length})` : typeof data);
  if (Array.isArray(data) && data[0]) console.log("[fixtures] sample:", JSON.stringify(data[0]).slice(0, 300));

  for (const fixture of data) {
    const home = fixture.Participant1IsHome ? fixture.Participant1 : fixture.Participant2;
    const away = fixture.Participant1IsHome ? fixture.Participant2 : fixture.Participant1;
    const name = home && away ? `${home} vs ${away}` : null;
    if (name) {
      await upsertFixtureName.run({
        fixture_id: fixture.FixtureId,
        name,
        competition: fixture.Competition ?? null,
      });
    }
  }
}

export async function resolveFixtureName(fixtureId, creds) {
  const cached = await getFixtureName.get({ fixture_id: fixtureId });
  if (cached) return cached;

  if (!snapshotLoaded) {
    if (!loadingPromise) {
      loadingPromise = loadFixturesSnapshot(creds)
        .then(() => {
          snapshotLoaded = true;
        })
        .catch((err) => {
          console.warn("[fixtures] snapshot load failed:", err.message);
          loadingPromise = null;
        });
    }
    await loadingPromise;
  }

  return (await getFixtureName.get({ fixture_id: fixtureId })) ?? null;
}
