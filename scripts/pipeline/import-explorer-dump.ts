// One-off importer: turns a text dump pulled from the OpenDota explorer into
// /matches/{id}-shaped cache files, so the pipeline can run fully offline.
// Usage: tsx scripts/pipeline/import-explorer-dump.ts <leagueid> <dump.txt> [more dumps…]
//   e.g. … 19719 data/cache/raw/ti2026-playoffs.txt data/cache/raw/ti2026-inventories.txt
// Match/player/purchase dumps use M|P|B lines; final-inventory dumps use M|<id> + I lines and
// are merged into the match (or into an existing cache file).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_DIR, matchCachePath, readJson, writeJson, type ODLeagueMatch, type ODMatch } from './opendota';

const [leagueArg, ...files] = process.argv.slice(2);
if (!leagueArg || !files.length) throw new Error('usage: import-explorer-dump.ts <leagueid> <dump.txt> [more…]');
const leagueid = Number(leagueArg);
const inventories = new Map<number, Map<number, number[]>>();
let invMatch: number | null = null;

const teams = new Map<number, string>();
const names = new Map<number, string>();
const matches: ODMatch[] = [];
let cur: ODMatch | null = null;

const lines = files.flatMap((file) => readFileSync(file, 'utf8').split('\n'));
for (const line of lines) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [tag, ...f] = line.split('|');
  if (tag === 'M' && f.length === 1) {
    invMatch = Number(f[0]);
    inventories.set(invMatch, new Map());
  } else if (tag === 'I' && invMatch !== null) {
    inventories.get(invMatch)!.set(Number(f[0]), f[1].split(',').map(Number));
  } else if (tag === 'T') teams.set(Number(f[0]), f[1]);
  else if (tag === 'N') names.set(Number(f[0]), f[1]);
  else if (tag === 'M') {
    const [id, start, dur, rw, rt, dt, patch, series] = f;
    cur = {
      match_id: Number(id),
      leagueid,
      start_time: Number(start),
      duration: Number(dur),
      radiant_win: rw === 'true',
      patch: Number(patch),
      series_type: Number(series),
      radiant_team: { team_id: Number(rt), name: teams.get(Number(rt)) },
      dire_team: { team_id: Number(dt), name: teams.get(Number(dt)) },
      players: [],
      _source: 'opendota-explorer-import',
    };
    matches.push(cur);
  } else if (tag === 'P' && cur) {
    const [slot, hero, lane, acct, gpm] = f.map(Number);
    cur.players.push({
      player_slot: slot,
      hero_id: hero,
      lane_role: lane,
      account_id: acct,
      gold_per_min: gpm,
      isRadiant: slot < 128,
      leaver_status: 0,
      name: names.get(acct) ?? null,
      purchase_log: [],
    });
  } else if (tag === 'B' && cur) {
    const p = cur.players[cur.players.length - 1];
    p.purchase_log = f[0]
      .trim()
      .split(/\s+/)
      .map((t) => {
        const i = t.indexOf(':');
        return { time: Number(t.slice(0, i)), key: t.slice(i + 1) };
      });
  }
}

function applyInventory(m: ODMatch) {
  const inv = inventories.get(m.match_id);
  if (!inv) return;
  for (const p of m.players) {
    const items = inv.get(p.player_slot);
    if (!items) continue;
    items.forEach((id, i) => ((p as unknown as Record<string, number>)[`item_${i}`] = id));
  }
}
for (const m of matches) {
  applyInventory(m);
  writeJson(matchCachePath(m.match_id), m, false);
}
// Inventory-only dumps update matches imported earlier.
for (const id of inventories.keys()) {
  if (matches.some((m) => m.match_id === id)) continue;
  const m = readJson<ODMatch>(matchCachePath(id));
  if (!m) continue;
  applyInventory(m);
  writeJson(matchCachePath(id), m, false);
}

const listFile = join(CACHE_DIR, 'leagues', `${leagueid}.json`);
const list = readJson<ODLeagueMatch[]>(listFile) ?? [];
for (const m of matches) {
  if (!list.some((x) => x.match_id === m.match_id)) {
    list.push({ match_id: m.match_id, start_time: m.start_time, duration: m.duration, radiant_win: m.radiant_win, leagueid });
  }
}
list.sort((a, b) => a.match_id - b.match_id);
writeJson(listFile, list);
console.log(`Imported ${matches.length} matches (${matches.reduce((n, m) => n + m.players.length, 0)} players) into ${CACHE_DIR}`);
