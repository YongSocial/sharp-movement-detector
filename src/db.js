import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export const insertPricePoint = {
  run: (p) => supabase.from("price_history").insert({
    fixture_id: p.fixture_id, market: p.market, selection: p.selection,
    price: p.price, ts: p.ts, bookmaker: p.bookmaker,
  }),
};

export const insertSignal = {
  run: (p) => supabase.from("signals").insert({
    fixture_id: p.fixture_id, market: p.market, selection: p.selection,
    prev_price: p.prev_price, new_price: p.new_price, delta: p.delta,
    delta_pct: p.delta_pct, direction: p.direction, detected_at: p.detected_at,
    bookmaker: p.bookmaker,
  }),
};

export const getUnresolvedSignalsForFixture = {
  all: async () => {
    const { data } = await supabase.from("signals").select("fixture_id").eq("resolved", false);
    const unique = [...new Set((data ?? []).map((r) => r.fixture_id))];
    return unique.map((fixture_id) => ({ fixture_id }));
  },
};

export const resolveSignalsForFixture = {
  run: async ({ fixture_id, outcome }) => {
    const { data: rows } = await supabase
      .from("signals")
      .select("*")
      .eq("fixture_id", fixture_id)
      .eq("resolved", false);

    for (const row of rows ?? []) {
      const predicted_correctly =
        (row.selection === outcome && row.direction === "shortening") ||
        (row.selection !== outcome && row.direction === "drifting");

      await supabase
        .from("signals")
        .update({ resolved: true, outcome, predicted_correctly })
        .eq("id", row.id);
    }
  },
};

export const recentSignals = {
  all: async ({ limit } = {}) => {
    const { data } = await supabase
      .from("signals")
      .select("*")
      .order("detected_at", { ascending: false })
      .limit(limit ?? 100);
    return data ?? [];
  },
};

export const accuracyStats = {
  get: async () => {
    const { data } = await supabase.from("signals").select("predicted_correctly").eq("resolved", true);
    const rows = data ?? [];
    const total_resolved = rows.length;
    const correct = rows.filter((r) => r.predicted_correctly).length;
    const accuracy_pct = total_resolved ? Math.round((correct / total_resolved) * 1000) / 10 : null;
    return { total_resolved, correct, accuracy_pct };
  },
};

export const upsertFixtureName = {
  run: (p) => supabase.from("fixtures").upsert({
    fixture_id: p.fixture_id, name: p.name, competition: p.competition,
  }),
};

export const getFixtureName = {
  get: async ({ fixture_id }) => {
    const { data } = await supabase
      .from("fixtures")
      .select("name, competition")
      .eq("fixture_id", fixture_id)
      .maybeSingle();
    return data ?? null;
  },
};

export default supabase;
