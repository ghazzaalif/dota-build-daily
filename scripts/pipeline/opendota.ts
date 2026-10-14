// OpenDota client (PRD §8): ≤ 1 req/sec, exponential backoff on 429/5xx,
// every match JSON cached on disk so each match is fetched once.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const BASE = 'https://api.opendota.com/api';
const MIN_INTERVAL_MS = 1000;
const MAX_RETRIES = 5;

export const CACHE_DIR = join(process.cwd(), 'data', 'cache');

let lastRequest = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
}

export async function odFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.OPENDOTA_API_KEY;
  const url = `${BASE}${path}${key ? `${path.includes('?') ? '&' : '?'}api_key=${key}` : ''}`;
  for (let attempt = 0; ; attempt++) {
    await throttle();
    const res = await fetch(url, init);
    if (res.ok) return (await res.json()) as T;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      throw new Error(`OpenDota ${init.method ?? 'GET'} ${path} failed: HTTP ${res.status}`);
    }
    const backoff = 2 ** attempt * 2000 + Math.floor(Math.random() * 500);
    console.warn(`  ↻ ${res.status} on ${path}, retrying in ${backoff} ms`);
    await sleep(backoff);
  }
}

export function readJson<T>(file: string): T | null {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : null;
}

export function writeJson(file: string, data: unknown, pretty = true) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, pretty ? 2 : 0) + '\n');
}

export interface ODPurchase {
  time: number;
  key: string;
}

export interface ODPlayer {
  player_slot: number;
  account_id?: number;
  hero_id: number;
  isRadiant?: boolean;
  lane_role?: number | null;
  net_worth?: number | null;
  gold_per_min?: number | null;
  leaver_status?: number | null;
  purchase_log?: ODPurchase[] | null;
  first_purchase_time?: Record<string, number> | null;
  /** Final main inventory, as OpenDota item IDs (0 = empty slot). */
  item_0?: number;
  item_1?: number;
  item_2?: number;
  item_3?: number;
  item_4?: number;
  item_5?: number;
  name?: string | null;
  personaname?: string | null;
}

export interface ODMatch {
  match_id: number;
  leagueid: number;
  start_time: number;
  duration: number;
  radiant_win: boolean;
  patch?: number;
  series_type?: number | null;
  radiant_team?: { team_id?: number; name?: string } | null;
  dire_team?: { team_id?: number; name?: string } | null;
  players: ODPlayer[];
  /** Present on cache files imported outside the /matches endpoint. */
  _source?: string;
}

export interface ODLeagueMatch {
  match_id: number;
  start_time: number;
  duration: number;
  radiant_win: boolean;
  leagueid: number;
}

export const matchCachePath = (id: number) => join(CACHE_DIR, 'matches', `${id}.json`);

/** Fetches a match once; later calls read the disk cache. */
export async function getMatch(id: number, offline: boolean): Promise<ODMatch | null> {
  const cached = readJson<ODMatch>(matchCachePath(id));
  if (cached && hasPurchaseLogs(cached)) return cached;
  if (offline) return cached;
  const m = await odFetch<ODMatch>(`/matches/${id}`);
  writeJson(matchCachePath(id), m, false);
  return m;
}

export function hasPurchaseLogs(m: ODMatch): boolean {
  return m.players.some((p) => Array.isArray(p.purchase_log) && p.purchase_log.length > 0);
}

/** §8 step 3: no purchase_log → ask OpenDota to parse the replay; retry next run. */
export async function requestParse(id: number): Promise<void> {
  await odFetch(`/request/${id}`, { method: 'POST' });
}
