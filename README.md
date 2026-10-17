# Dota Build Daily

A daily Wordle-style puzzle: guess the 6 items a pro held in his main inventory when a big-tournament match ended, ordered by when he bought each one, in 6 rows. Spec: [`docs/dota-build-wordle-prd.md`](docs/dota-build-wordle-prd.md) (v1.1).

- **Frontend:** Vite + React + TypeScript + Tailwind, static SPA (no backend)
- **Pipeline:** Node 20 + TypeScript scripts run by a GitHub Actions cron, data from OpenDota
- **Tests:** Vitest (59 unit tests) + a browser smoke test (`tests/e2e/smoke.mjs`)

## Quick start

```bash
npm install
npm run dev                 # http://localhost:5173
npm test                    # unit tests
npm run build               # dist/ (static site)
```

The repo ships with real puzzles generated from **The International 2026 playoffs** (9 matches, cached in `data/cache/`), so the game works offline straight away:

```bash
npm run pipeline:offline -- --today=2026-10-14 --report
```

## Project layout

```text
src/
  config.ts             PRD §9.5 constants (MIN_ITEM_COST, SHARED_COMPONENT_MIN_COST, LAUNCH_DATE, …)
  game/                 pure game logic — scoring, hints, share, storage, date, search, reducer
  components/           Grid, ItemPicker, HintsPanel, EndScreen, dialogs
  data/load.ts          fetches /data/*.json and /puzzles/{date}.json
scripts/pipeline/
  run.ts                the daily pipeline (§8 steps 1–7)
  eligibility.ts        §7.3 item eligibility + §5.3 significant components
  answer.ts             §7.4 answer from purchase_log (first_purchase_time fallback)
  roles.ts              §7.5 position heuristic
  candidates.ts         §7.2 filters S1–S6, S9 and the S3 patch fallback
  schedule.ts           S7 cooldowns, S8 role mix, seeded ranking
  publish.ts            queue, validation, spoiler-safe publish
data/
  leagues.json          tournament allowlist (hand-edited)
  item-rules.json       exclusions, boots, aliases, shop categories (hand-edited)
  overrides.json        pin / block / stage labels
public/
  data/                 items.json, heroes.json (generated per patch)
  puzzles/              published puzzles (date ≤ tomorrow only) + index.json
queue/                  PRIVATE future puzzles — gitignored, lives in a private repo in prod
```

## Pipeline

`npx tsx scripts/pipeline/run.ts` refreshes constants, discovers allowlisted league matches, fetches each match once (cached), requests a parse when `purchase_log` is missing, builds candidates, keeps 7 days queued, validates, and publishes only puzzles dated ≤ tomorrow. It throttles to 1 req/s with exponential backoff on 429/5xx, and exits non-zero (so GitHub emails you) when the queue drops below 3 days or no candidate fits.

Flags: `--offline` (constants from the pinned `dotaconstants` package), `--no-fetch` (cache only), `--today=YYYY-MM-DD`, `--report`.

### Deploy (Render static site)

- **Render:** Static Site from this repo, build command `npm ci && npm run build`, publish directory `dist`, auto-deploy on push to `main`.
- **Daily puzzles:** the `pipeline` workflow runs at 22:00 UTC, commits tomorrow's puzzle to `public/puzzles`, and that push redeploys the site. Run it once by hand (Actions → pipeline → Run workflow) to fill the 7-day buffer.
- **Private queue:** by default the future-puzzle queue lives in this repo's Actions cache. For a sturdier setup, create a private repo and set repo variable `QUEUE_REPO` (`owner/name`) and secret `QUEUE_REPO_TOKEN`. Optional secret: `OPENDOTA_API_KEY`.
- **Before a public launch:** set `SITE_URL` (share text) in `src/config.ts`, uncomment the Plausible tag in `index.html`, and add the remaining Tier-1 leagues to `data/leagues.json` with their OpenDota IDs (only TI 2025 `18324` and TI 2026 `19719` are confirmed).

## PRD coverage

| Feature | Status |
|---|---|
| F1 daily loading (UTC reset, puzzle #, countdown, late-puzzle fallback + event, server `Date` clock-skew fix) | Done |
| F2 header, F3 grid (flip animation, symbols ✓ ↔ ◐ ✕, aria-labels, 🟧 tooltip) | Done |
| F4 picker (eligible only, 7 shop tabs, alias + fuzzy search, best-state shading, "in row", arrows; drag on desktop) | Done |
| F5 hints (schedule, early reveal with first-time confirm, lifeline lock) | Done |
| F6 end screen (timeline with minute, match facts, OpenDota/Dotabuff links) | Done |
| F7 share (exact format, no item names, `navigator.share` on touch) | Done |
| F8 stats + persistence (streaks, cross-reset finish, no-storage mode) | Done |
| F9 onboarding, F10 settings (colorblind, theme, keep greens, motion), F11 analytics hooks, F12 footer | Done |
| §7–8 pipeline incl. queue, validation, patch-change invalidation, overrides, determinism | Done |
| Offline PWA, archive, hard mode (P2 / backlog) | Not started |

### Choices where the PRD left room

- **Tap on a filled slot** selects it and shows Move left / Move right / Remove (44 px targets); tapping it again removes it. A bare "tap clears" made the P0 arrow buttons awkward on mobile.
- **💡N** counts hints revealed *early* (the PRD example shows 💡2 after three wrong rows, so auto-unlocks can't count).
- **Price bands** use edges 2,000 / 3,500 / 4,500 / 5,500 (`PRICE_BAND_EDGES`).
- **Role heuristic** also flags `needs_review` when a "support" out-farms a core by >25%.
- **Shop categories** double as the "currently in the shop" list, because OpenDota constants keep removed items (Necronomicon, etc.).

## Answer rule (changed 2026-10-14, replaces PRD §7.4)

The answer is the player's **6 main inventory slots at the end of the game**, ordered by when each item was bought, so it matches the scoreboard on OpenDota/Dotabuff.

- Only players whose 6 main slots all hold **distinct eligible items** qualify (S5). Backpack and neutral slots are ignored.
- Each item's time is the **last** purchase of that item (a sold-and-rebought item counts from the rebuy). An item missing from the purchase log (e.g. picked up) disqualifies the player.
- Level upgrades normalize as before: Boots of Travel 2 shows as Boots of Travel, Dagon 1–5 as Dagon.
- Aghanim's Shard and Aghanim's Blessing are no longer eligible: they're consumed on purchase and never sit in a slot.

## M0 data-spike findings (from the TI 2026 sample)

- `purchase_log` **does** contain completed items (`bfury`, `manta`, `black_king_bar`), so item times come from it; the `first_purchase_time` fallback is implemented anyway.
- With the final-inventory rule, 9 playoff matches → 90 players → **26 valid** (was 57 under the first-6-purchases rule). All 64 rejections are S5, mostly supports holding a wand, dust, wards or plain boots. Support puzzles will be rare, and a full league is needed to reach `MIN_POOL_SIZE` (30).
- The 20-match manual role check (≥ 90% target) and the 30-puzzle fairness review have **not** been done yet.
- The bundled cache was imported via the OpenDota explorer, which lacks `net_worth` and `leaver_status`; the role heuristic falls back to GPM there. Live `/matches` fetches include both.
- Stage labels for the TI 2026 playoff games (Grand Final, Upper/Lower Bracket Final) were set by hand in `overrides.json` from the series results.

Dota 2 is a registered trademark of Valve Corporation. This project is not affiliated with or endorsed by Valve. Match data from OpenDota.

## Discord Activity

The same game runs inside Discord as an Activity (like the Wordle one), with sign-in and a
"Played in this server today" board.

- **Client:** `src/discord/`. Only active when Discord launches the page (it adds `frame_id`
  and `instance_id`); the SDK is a separate chunk the website never loads.
- **Backend:** `server/` (Node 20, no framework). Exchanges the OAuth code, verifies Discord
  tokens and server membership, re-scores every upload with the game's own scoring code, and
  stores games in Postgres. Routes: `POST /token`, `GET|POST /game`, `GET /scoreboard`,
  `GET /stats`, `GET /health`. Build `npm run build:server`, start `npm run start:server`.
- **Env (Render web service):** `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DATABASE_URL`
  (Neon Postgres; Render's free Postgres is deleted after 30 days), optional `SITE_URL`.
- **Discord URL mappings** (Developer Portal → Activities → URL Mappings):

  | Prefix | Target |
  |---|---|
  | `/` | `dota-build-daily.onrender.com` |
  | `/api` | the API service host |
  | `/steam` | `cdn.cloudflare.steamstatic.com` |
  | `/discordcdn` | `cdn.discordapp.com` |

- **Results card:** when someone finishes, the bot posts a card (avatars + colour grids, never
  items) in the channel the game was opened in, and edits that same message as more people
  finish that day. Admins can pin a channel with `/results-channel`. "Play now!" on the card
  opens the Activity through `POST /interactions` (signature-checked). Needs the bot in the
  server (scopes `bot applications.commands`, permissions View Channel, Send Messages, Embed
  Links, Attach Files, Read Message History = `117760`) and `DISCORD_BOT_TOKEN` on Render.
  `.github/workflows/keepalive.yml` pings the API every 10 minutes because Discord gives a
  button 3 s to respond and a sleeping free instance takes ~50 s to wake.
- **Discord relay:** Discord blocks Render's shared free IPs, so the API calls Discord through a
  Cloudflare Worker (`relay/discord-relay.js`, deployed as `dota-discord-relay.ghazza123.workers.dev`).
  Worker secret `RELAY_KEY`; Render env `DISCORD_RELAY_KEY` (same value) and
  `DISCORD_API_BASE=https://dota-discord-relay.ghazza123.workers.dev/api/v10`. `GET /health`
  shows `viaRelay` and the last Discord status.
- **Tests:** `tests/server.test.ts` (API), `tests/results.test.ts` (card, posting, interactions), and `npm run test:discord`, which runs two players
  through the real build against a fake Discord host (`tests/e2e/discord-host.ts`).
- **Who can play:** until Discord verifies the app, only the developer team and app testers can
  launch it, in servers with fewer than 25 members.
