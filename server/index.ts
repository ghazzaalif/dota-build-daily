// Entry point for the Discord Activity backend (Render web service).
//
// Env:
//   DISCORD_CLIENT_ID      public application id
//   DISCORD_CLIENT_SECRET  OAuth2 secret (Render env var — never commit it)
//   DATABASE_URL           Postgres connection string (Neon). Without it, data lives in memory.
//   SITE_URL               where puzzles/items are published (default: the Render static site)
//   PORT                   set by Render
import { createServer } from 'node:http';
import { answerKey, decodeAnswer } from '../src/game/answer';
import type { DiscordUserLite } from '../src/discord/api';
import type { ItemsMap, Puzzle } from '../src/game/types';
import { createApp, type Content, type DiscordApi } from './app';
import { MemoryStore, PgStore, type Store } from './store';

const env = (k: string, fallback?: string) => process.env[k] ?? fallback ?? '';
const CLIENT_ID = env('DISCORD_CLIENT_ID', '1560832626720243823');
const CLIENT_SECRET = env('DISCORD_CLIENT_SECRET');
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

const app = createApp({
  store,
  discord,
  content,
  corsOrigins: [`*.discordsays.com`, SITE, 'http://localhost:5173'],
});
const port = Number(env('PORT', '3001'));
createServer(app).listen(port, () => console.log(`Dota Build Daily API listening on :${port}`));
