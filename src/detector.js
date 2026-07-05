import { CONFIG } from "./config.js";
import { insertPricePoint, insertSignal } from "./db.js";

const lastPrice = new Map();

function key(o) {
  return `${o.fixture_id}:${o.market}:${o.selection}:${o.bookmaker ?? "consensus"}`;
}

const MIN_UPDATE_GAP_MS = 5000;

export async function processOddsUpdate(update) {
  const k = key(update);
  const prev = lastPrice.get(k);

  if (prev && new Date(update.ts) - new Date(prev.ts) < MIN_UPDATE_GAP_MS) {
    return null;
  }

  await insertPricePoint.run({
    fixture_id: update.fixture_id,
    market: update.market,
    selection: update.selection,
    price: update.price,
    ts: update.ts,
    bookmaker: update.bookmaker ?? null,
  });

  lastPrice.set(k, { price: update.price, ts: update.ts });

  if (!prev) return null;

  const delta = update.price - prev.price;
  const deltaPct = Math.abs(delta) / prev.price;

  const isSharp =
    Math.abs(delta) >= CONFIG.moveThreshold || deltaPct >= CONFIG.moveThresholdPct;

  if (!isSharp) return null;

  const direction = delta < 0 ? "shortening" : "drifting";

  const signal = {
    fixture_id: update.fixture_id,
    market: update.market,
    selection: update.selection,
    prev_price: prev.price,
    new_price: update.price,
    delta,
    delta_pct: deltaPct,
    direction,
    detected_at: update.ts,
    bookmaker: update.bookmaker ?? null,
  };

  await insertSignal.run(signal);
  return signal;
}

export function normalizeOddsEvent(raw) {
  const updates = [];
  const fixtureId = raw.FixtureId;
  const ts = raw.Ts ? new Date(raw.Ts).toISOString() : new Date().toISOString();
  const bookmaker = raw.Bookmaker ?? "consensus";
  const market = raw.MarketParameters
    ? `${raw.SuperOddsType}(${raw.MarketParameters})`
    : raw.SuperOddsType;

  const priceNames = raw.PriceNames ?? [];
  const prices = raw.Prices ?? [];

  if (!fixtureId || !market) return updates;

  for (let i = 0; i < priceNames.length; i++) {
    const selection = priceNames[i];
    const rawPrice = prices[i];
    if (selection == null || rawPrice == null) continue;
    const price = rawPrice / 1000;
    updates.push({ fixture_id: fixtureId, market, selection, price, ts, bookmaker });
  }

  return updates;
}
