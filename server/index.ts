// Entry point for the Discord Activity backend (Render web service).
//
// Env:
//   DISCORD_CLIENT_ID      public application id
//   DISCORD_CLIENT_SECRET  OAuth2 secret (Render env var — never commit it)
//   DATABASE_URL           Postgres connection string (Neon). Without it, data lives in memory.
//   DISCORD_BOT_TOKEN      bot token, for posting the daily results card (Render env var — never commit it)
//   DISCORD_PUBLIC_KEY     public key for checking interaction signatures (default: this app's)
//   SITE_URL               where puzzles/items are published (default: the Render static site)
//   PORT                   set by Render
import { createServer } from 'node:http';
import { answerKey, decodeAnswer } from '../src/game/answer';
import type { DiscordUserLite } from '../src/discord/api';
import type { ItemsMap, Puzzle } from '../src/game/types';
import { createApp, type Content, type DiscordApi } from './app';
import { createInteractions, RESULTS_CHANNEL_COMMAND } from './interactions';
import { createResultsPublisher, LAUNCH_BUTTON_ID, type BotApi, type OutgoingMessage } from './results';
import { MemoryStore, PgStore, type Store } from './store';

const env = (k: string, fallback?: string) => process.env[k] ?? fallback ?? '';
const CLIENT_ID = env('DISCORD_CLIENT_ID', '1560832626720243823');
const CLIENT_SECRET = env('DISCORD_CLIENT_SECRET');
const BOT_TOKEN = env('DISCORD_BOT_TOKEN');
const PUBLIC_KEY = env('DISCORD_PUBLIC_KEY', 'a305659cb4c15983714155e66b562e3b8a0ee5ccea24caa4cb12bb20890f7b9e');
const SITE = env('SITE_URL', 'https://dota-build-daily.onrender.com').replace(/\/$/, '');
const DISCORD = 'https://discord.com/api/v10';

const discord: DiscordApi = {
  async exchangeCode(code) {
    const res = await fetch(`${DISCORD}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code', code }),
    });
    if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as { access_token: string };
  },
  async fetchUser(token) {
    const res = await fetch(`${DISCORD}/users/@me`, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`users/@me: ${res.status}`);
    const u = (await res.json()) as { id: string; username: string; global_name?: string | null; avatar?: string | null };
    return { id: u.id, username: u.username, globalName: u.global_name ?? null, avatar: u.avatar ?? null } satisfies DiscordUserLite;
  },
  async fetchGuildIds(token) {
    const res = await fetch(`${DISCORD}/users/@me/guilds?limit=200`, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`users/@me/guilds: ${res.status}`);
    return ((await res.json()) as { id: string }[]).map((g) => g.id);
  },
};

/** Bot calls, retrying once when Discord rate-limits us. */
async function botFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const res = await fetch(`${DISCORD}${path}`, { ...init, headers: { ...init.headers, authorization: `Bot ${BOT_TOKEN}` } });
  if (res.status === 429 && retry) {
    const { retry_after } = (await res.json().catch(() => ({ retry_after: 1 }))) as { retry_after?: number };
    await new Promise((r) => setTimeout(r, Math.min(10, retry_after ?? 1) * 1000));
    return botFetch(path, init, false);
  }
  return res;
}

function messageForm(m: OutgoingMessage): FormData {
  const form = new FormData();
  form.append(
    'payload_json',
    JSON.stringify({
      content: m.content,
      allowed_mentions: { parse: [] },
      attachments: [{ id: 0, filename: m.filename }],
      components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Play now!', custom_id: LAUNCH_BUTTON_ID }] }],
    }),
  );
  form.append('files[0]', new Blob([new Uint8Array(m.png)], { type: 'image/png' }), m.filename);
  return form;
}

const bot: BotApi = {
  async channelGuild(channelId) {
    const res = await botFetch(`/channels/${channelId}`);
    if (!res.ok) {
      console.warn(`can't see channel ${channelId}: ${res.status} (is the bot in that server?)`);
      return null;
    }
    return ((await res.json()) as { guild_id?: string }).guild_id ?? null;
  },
  async createMessage(channelId, m) {
    const res = await botFetch(`/channels/${channelId}/messages`, { method: 'POST', body: messageForm(m) });
    if (!res.ok) throw new Error(`post in ${channelId}: ${res.status} ${await res.text()}`);
    return ((await res.json()) as { id: string }).id;
  },
  async editMessage(channelId, messageId, m) {
    const res = await botFetch(`/channels/${channelId}/messages/${messageId}`, { method: 'PATCH', body: messageForm(m) });
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(`edit ${messageId}: ${res.status} ${await res.text()}`);
    return true;
  },
  async fetchImage(url) {
    try {
      const res = await fetch(url);
      return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    } catch {
      return null;
    }
  },
};

/** Creates or updates /results-channel (POST upserts by name and leaves the entry point command alone). */
async function registerCommands() {
  const res = await botFetch(`/applications/${CLIENT_ID}/commands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(RESULTS_CHANNEL_COMMAND),
  });
  if (!res.ok) console.warn(`registering /${RESULTS_CHANNEL_COMMAND.name} failed: ${res.status} ${await res.text()}`);
  else console.log(`/${RESULTS_CHANNEL_COMMAND.name} registered`);
}

// Puzzles and items come from the public site. Published puzzles never change, so they
// are cached for the life of the process; items refresh every 6 hours (patch days).
const puzzleCache = new Map<string, Puzzle>();
let itemsCache: { at: number; items: ItemsMap } | null = null;
const content: Content = {
  async puzzle(date) {
    if (puzzleCache.has(date)) return puzzleCache.get(date)!;
    const res = await fetch(`${SITE}/puzzles/${date}.json`);
    if (!res.ok) return null;
    const p = (await res.json()) as Puzzle;
    decodeAnswer(p.answer, answerKey(p.date, p.puzzleNo)); // throws if the file is malformed
    puzzleCache.set(date, p);
    return p;
  },
  async items() {
    if (itemsCache && Date.now() - itemsCache.at < 6 * 3600_000) return itemsCache.items;
    const res = await fetch(`${SITE}/data/items.json`);
    if (!res.ok) throw new Error(`items.json: ${res.status}`);
    itemsCache = { at: Date.now(), items: (await res.json()) as ItemsMap };
    return itemsCache.items;
  },
};

async function makeStore(): Promise<Store> {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL is not set: using in-memory storage (data is lost on restart)');
    return new MemoryStore();
  }
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true }, max: 5 });
  return new PgStore(pool);
}

const store = await makeStore();
await store.init();
if (!CLIENT_ID || !CLIENT_SECRET) console.warn('DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET not set: sign-in will fail');

if (BOT_TOKEN) void registerCommands();
else console.warn('DISCORD_BOT_TOKEN not set: results cards will not be posted in Discord');

const app = createApp({
  store,
  discord,
  content,
  corsOrigins: [`*.discordsays.com`, SITE, 'http://localhost:5173'],
  results: BOT_TOKEN ? createResultsPublisher({ store, content, bot }) : undefined,
  interactions: createInteractions({ store, publicKey: PUBLIC_KEY }),
});
const port = Number(env('PORT', '3001'));
createServer(app).listen(port, () => console.log(`Dota Build Daily API listening on :${port}`));
