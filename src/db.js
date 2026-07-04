import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(new URL("../data/signals.db", import.meta.url).pathname);

db.exec(`
  CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id INTEGER NOT NULL,
    market TEXT NOT NULL,
    selection TEXT NOT NULL,
    prev_price REAL NOT NULL,
    new_price REAL NOT NULL,
    delta REAL NOT NULL,
    delta_pct REAL NOT NULL,
    direction TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    bookmaker TEXT,
    resolved INTEGER NOT NULL DEFAULT 0,
    outcome TEXT,
    predicted_correctly INTEGER
  );

  CREATE TABLE IF NOT EXISTS price_history (
    fixture_id INTEGER NOT NULL,
    market TEXT NOT NULL,
    selection TEXT NOT NULL,
    price REAL NOT NULL,
    ts TEXT NOT NULL,
    bookmaker TEXT
  );

  CREATE TABLE IF NOT EXISTS fixtures (
    fixture_id INTEGER PRIMARY KEY,
    name TEXT,
    competition TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_price_history_key
    ON price_history (fixture_id, market, selection, ts);

  CREATE INDEX IF NOT EXISTS idx_signals_fixture ON signals (fixture_id);
  CREATE INDEX IF NOT EXISTS idx_signals_resolved ON signals (resolved);
`);

function prepareNamed(sql) {
  const rewrittenSql = sql.replace(/@(\w+)/g, "$$$1");
  const stmt = db.prepare(rewrittenSql);
  const toDollarParams = (params = {}) => {
    const out = {};
    for (const [k, v] of Object.entries(params)) out[`$${k}`] = v === undefined ? null : v;
    return out;
  };
  return {
    run: (params) => stmt.run(toDollarParams(params)),
    get: (params) => stmt.get(toDollarParams(params)),
    all: (params) => stmt.all(toDollarParams(params)),
  };
}

export const insertPricePoint = prepareNamed(`
  INSERT INTO price_history (fixture_id, market, selection, price, ts, bookmaker)
  VALUES (@fixture_id, @market, @selection, @price, @ts, @bookmaker)
`);

export const getBaselinePrice = prepareNamed(`
  SELECT price, ts FROM price_history
  WHERE fixture_id = @fixture_id AND market = @market AND selection = @selection
    AND ts <= @cutoff
  ORDER BY ts DESC
  LIMIT 1
`);

export const insertSignal = prepareNamed(`
  INSERT INTO signals (
    fixture_id, market, selection, prev_price, new_price, delta, delta_pct,
    direction, detected_at, bookmaker
  ) VALUES (
    @fixture_id, @market, @selection, @prev_price, @new_price, @delta, @delta_pct,
    @direction, @detected_at, @bookmaker
  )
`);

export const getUnresolvedSignalsForFixture = prepareNamed(`
  SELECT DISTINCT fixture_id FROM signals WHERE resolved = 0
`);

export const resolveSignalsForFixture = prepareNamed(`
  UPDATE signals
  SET resolved = 1,
      outcome = @outcome,
      predicted_correctly = CASE
        WHEN selection = @outcome AND direction = 'shortening' THEN 1
        WHEN selection != @outcome AND direction = 'drifting' THEN 1
        ELSE 0
      END
  WHERE fixture_id = @fixture_id AND resolved = 0
`);

export const recentSignals = prepareNamed(`
  SELECT * FROM signals ORDER BY detected_at DESC LIMIT @limit
`);

export const accuracyStats = prepareNamed(`
  SELECT
    COUNT(*) AS total_resolved,
    SUM(predicted_correctly) AS correct,
    ROUND(100.0 * SUM(predicted_correctly) / NULLIF(COUNT(*), 0), 1) AS accuracy_pct
  FROM signals WHERE resolved = 1
`);

export const upsertFixtureName = prepareNamed(`
  INSERT INTO fixtures (fixture_id, name, competition)
  VALUES (@fixture_id, @name, @competition)
  ON CONFLICT(fixture_id) DO UPDATE SET name=excluded.name, competition=excluded.competition
`);

export const getFixtureName = prepareNamed(`
  SELECT name, competition FROM fixtures WHERE fixture_id = @fixture_id
`);

export default db;