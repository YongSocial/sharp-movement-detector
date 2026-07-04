import express from "express";
import { CONFIG } from "./config.js";
import { recentSignals, accuracyStats } from "./db.js";

const app = express();

app.get("/api/signals", (_req, res) => {
  res.json(recentSignals.all({ limit: 100 }));
});

app.get("/api/stats", (_req, res) => {
  res.json(accuracyStats.get());
});

app.get("/", (_req, res) => {
  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Sharp Movement Detector</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0b0d12; color: #e6e8ee; margin: 0; padding: 24px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .sub { color: #8b93a7; font-size: 13px; margin-bottom: 20px; }
    .stats { display: flex; gap: 16px; margin-bottom: 24px; }
    .card { background: #151823; border-radius: 8px; padding: 14px 18px; }
    .card .num { font-size: 24px; font-weight: 600; }
    .card .label { font-size: 12px; color: #8b93a7; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #232838; }
    th { color: #8b93a7; font-weight: 500; }
    .shortening { color: #4ade80; }
    .drifting { color: #f87171; }
    .pending { color: #8b93a7; }
    .correct { color: #4ade80; }
    .wrong { color: #f87171; }
  </style>
</head>
<body>
  <h1>Sharp Movement Detector</h1>
  <div class="sub">Live TxLINE odds monitor — network: ${CONFIG.network}</div>
  <div class="stats" id="stats"></div>
  <table>
    <thead>
      <tr><th>Fixture</th><th>Market</th><th>Selection</th><th>Move</th><th>Direction</th><th>Detected</th><th>Result</th></tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>
  <script>
    async function refresh() {
      const [signals, stats] = await Promise.all([
        fetch('/api/signals').then(r => r.json()),
        fetch('/api/stats').then(r => r.json()),
      ]);

      document.getElementById('stats').innerHTML = \`
        <div class="card"><div class="num">\${signals.length}</div><div class="label">Signals logged</div></div>
        <div class="card"><div class="num">\${stats.total_resolved ?? 0}</div><div class="label">Resolved</div></div>
        <div class="card"><div class="num">\${stats.accuracy_pct ?? '—'}%</div><div class="label">Prediction accuracy</div></div>
      \`;

      document.getElementById('rows').innerHTML = signals.map(s => \`
        <tr>
          <td>\${s.fixture_id}</td>
          <td>\${s.market}</td>
          <td>\${s.selection}</td>
          <td>\${s.prev_price.toFixed(2)} → \${s.new_price.toFixed(2)}</td>
          <td class="\${s.direction}">\${s.direction}</td>
          <td>\${new Date(s.detected_at).toLocaleTimeString()}</td>
          <td class="\${s.resolved ? (s.predicted_correctly ? 'correct' : 'wrong') : 'pending'}">
            \${s.resolved ? (s.predicted_correctly ? '✓ correct (' + s.outcome + ')' : '✗ wrong (' + s.outcome + ')') : 'pending'}
          </td>
        </tr>
      \`).join('');
    }
    refresh();
    setInterval(refresh, 5000);
  </script>
</body>
</html>`);
});

app.listen(CONFIG.port, () => {
  console.log(`[dashboard] http://localhost:${CONFIG.port}`);
});
