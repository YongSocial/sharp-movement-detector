# Sharp Movement Detector

Autonomous agent for the TxODDS "Trading Tools and Agents" hackathon (World Cup track).

Streams live TxLINE odds via SSE, flags statistically significant line moves in
real time, logs every signal to SQLite, and — once each fixture finishes —
checks whether the move correctly anticipated the result. No manual input
required once running.

## How it maps to the judging criteria

- **Core functionality & data ingestion**: consumes `/api/odds/stream` (SSE) live from TxLINE.
- **Autonomous operation**: one process, no human-in-the-loop; reconnects with backoff on drops, resolves outcomes on a timer.
- **Logic & architecture**: deterministic threshold rule (absolute delta OR % delta), fully documented in `src/detector.js`.
- **Production readiness**: persistent SQLite log, reconnect/backoff, separate activation step, dashboard for monitoring.
- **Innovation**: closes the loop — every signal is later graded against the real outcome, producing a running accuracy score, not just a raw alert feed.

## Setup

```bash
npm install
cp .env.example .env
```

1. Generate a Solana keypair for devnet (or use an existing one) and fund it with a small amount of devnet SOL for tx fees:
   ```bash
   solana-keygen new -o wallet-keypair.json
   solana airdrop 1 $(solana-keygen pubkey wallet-keypair.json) --url devnet
   ```
2. Download the TxLINE Anchor IDL matching your network and save it as `idl/txoracle.json`:
   - Devnet: https://txline.txodds.com/documentation/programs/devnet
   - Mainnet: https://txline.txodds.com/documentation/programs/mainnet
3. Subscribe + activate free World Cup tier access:
   ```bash
   npm run activate
   ```
   This subscribes the wallet on-chain to service level 1 (60s-delay World Cup + International Friendlies, free) and saves the resulting JWT + API token to `data/credentials.json`.
4. Start the detector:
   ```bash
   npm start
   ```
5. In a second terminal, start the dashboard:
   ```bash
   npm run dashboard
   ```
   Open http://localhost:4000

## Tuning

Edit `.env`:
- `MOVE_THRESHOLD` — absolute decimal-odds delta that counts as a sharp move (default 0.15)
- `MOVE_THRESHOLD_PCT` — relative % delta that counts as sharp (default 5%)

A move is flagged if either threshold is crossed.

## Notes on the TxLINE payload shapes

`src/detector.js#normalizeOddsEvent` maps the raw odds-stream event into the
detector's internal shape (`fixture_id`, `market`, `selection`, `price`, `ts`,
`bookmaker`). `src/resolver.js#deriveOutcome` does the same for scores
snapshots. Both are written defensively (multiple field-name fallbacks) but
should be validated against a live stream sample before the demo — TxODDS's
docs describe the schema at `/documentation/odds/overview` and
`/documentation/scores/soccer-feed`; field names here are best-effort from
the docs and worth double-checking against one real event.

## Deploying: GitHub Pages frontend + hosted backend

The dashboard is split into two pieces so it can be shared as a public link:

- **Backend** (`server/combined.js`) — runs the streaming agent + a small
  CORS-enabled JSON API (`/api/signals`, `/api/stats`). Needs to run
  somewhere with a persistent process and filesystem (SQLite file).
- **Frontend** (`docs/index.html`) — static page, goes on GitHub Pages. Asks
  once for your backend's URL, stores it in localStorage, polls it every 5s.

### 1. Deploy the backend (Render example)

1. Push this repo to GitHub.
2. On Render: New → Web Service → connect the repo.
3. Build command: `npm install`. Start command: `node server/combined.js`.
4. Add env vars (see `.env.example`): `NETWORK`, `SERVICE_LEVEL_ID`, etc.
5. **Credentials**: `data/credentials.json` (from `npm run activate`) isn't
   committed to git (see `.gitignore`). Either run `npm run activate` locally
   and paste its contents into a Render env var you read at boot, or add a
   one-off Render shell step to run `npm run activate` after first deploy.
   Simplest for a hackathon demo: run activate locally, then temporarily
   commit `data/credentials.json` directly (remove `.gitignore` entry) —
   fine for a devnet demo token, not for a real secret.
6. Free-tier hosts typically don't persist disks across restarts/deploys —
   the SQLite file (and thus signal history) resets on redeploy. Fine for a
   hackathon demo; for real persistence use a host with a persistent volume
   or swap SQLite for a hosted Postgres.
7. Note the deployed URL, e.g. `https://sharp-movement-detector.onrender.com`.

### 2. Deploy the frontend (GitHub Pages)

1. In repo settings → Pages → set source to the `docs/` folder on your main branch.
2. Your site goes live at `https://<username>.github.io/<repo>/`.
3. Open it, paste your backend URL from step 1 into the input box, click Connect.
4. Share that GitHub Pages link — anyone opening it just needs the backend URL once (or you can hardcode it in `docs/index.html` before pushing, see below).

To skip the manual URL entry and just hardcode your backend for anyone visiting:

```js
// in docs/index.html, replace:
let apiBase = localStorage.getItem(STORAGE_KEY) || '';
// with:
let apiBase = localStorage.getItem(STORAGE_KEY) || 'https://your-backend-url.onrender.com';
```



```
src/
  config.js        network + tuning config
  activate.js       one-time: on-chain subscribe + API token activation
  tokenStore.js     persists jwt/apiToken
  sseClient.js      generic SSE reader with reconnect/backoff
  detector.js       core sharp-move detection logic
  resolver.js       checks scores, grades resolved signals
  agent.js          standalone long-running agent process
  scoreSignals.js   one-off resolver run (e.g. cron)
  dashboard.js      local dev dashboard (agent + UI in one, localhost only)
server/
  api.js            standalone JSON API (pairs with a separately-run agent.js)
  combined.js        agent + JSON API in one process — use this for deploy
docs/
  index.html        static frontend for GitHub Pages, calls the deployed API
data/
  signals.db        SQLite log (created at runtime)
  credentials.json  jwt/apiToken (created by activate.js)
```
