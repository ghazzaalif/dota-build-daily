// Decodes data/cache/drafts/*.txt seed files (compact OpenDota draft dumps) into
// data/cache/drafts/{matchId}.json, the per-match draft cache Draft mode reads.
// Usage: tsx scripts/pipeline/import-draft-seed.ts [file.txt …]
// Every line is validated: 24 entries in order, distinct heroes, and each team's 5 picks
// matching that team's players, so a damaged line fails loudly instead of seeding a bad puzzle.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXPECTED_BANS, EXPECTED_PICKS } from '../../src/config';
import { DRAFT_CACHE_DIR } from './draft';
import { writeJson, type ODMatch, type ODPickBan, type ODPlayer } from './opendota';

const SLOTS = [0, 1, 2, 3, 4, 128, 129, 130, 131, 132];

export function decodeSeed(text: string, leagueId: number): ODMatch[] {
  const lines = text.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  const dict = (prefix: string) => JSON.parse(lines.find((l) => l.startsWith(prefix))!.slice(prefix.length)) as string[];
  const teams = dict('TEAMS=');
  const names = dict('NAMES=');
  const out: ODMatch[] = [];
  for (const line of lines.filter((l) => /^\d+\|/.test(l))) {
    const [id, start, duration, rw, rt, dt, patch, pbs, pls] = line.split('|');
    const picks_bans: ODPickBan[] = [...pbs.matchAll(/(\d+)([abAB])/g)].map((m, order) => ({
      hero_id: Number(m[1]),
      is_pick: m[2] === 'A' || m[2] === 'B',
      team: m[2].toLowerCase() === 'a' ? 0 : 1,
      order,
    }));
    const players: ODPlayer[] = pls.split(';').map((p, i) => {
      const [hero, lane, nw10, leaver, name] = p.split(',').map(Number);
      return {
        player_slot: SLOTS[i],
        isRadiant: SLOTS[i] < 128,
        hero_id: hero,
        lane_role: lane,
        net_worth: nw10 * 10,
        leaver_status: leaver,
        name: names[name],
      };
    });
    const m: ODMatch = {
      match_id: Number(id),
      leagueid: leagueId,
      start_time: Number(start),
      duration: Number(duration),
      radiant_win: rw === '1',
      patch: Number(patch),
      game_mode: 2,
      radiant_team: { name: teams[Number(rt)] },
      dire_team: { name: teams[Number(dt)] },
      picks_bans,
      players,
      _source: 'opendota-draft-seed',
    };
    const err = checkSeed(m);
    if (err) throw new Error(`seed line for ${id}: ${err}`);
    out.push(m);
  }
  return out;
}

function checkSeed(m: ODMatch): string | null {
  const pb = m.picks_bans!;
  if (pb.length !== EXPECTED_PICKS + EXPECTED_BANS) return `${pb.length} entries`;
  if (new Set(pb.map((x) => x.hero_id)).size !== pb.length) return 'duplicate hero in draft';
  if (m.players.length !== 10) return `${m.players.length} players`;
  for (const team of [0, 1]) {
    const picks = pb.filter((x) => x.is_pick && x.team === team).map((x) => x.hero_id).sort();
    const heroes = m.players.filter((p) => (p.player_slot < 128 ? 0 : 1) === team).map((p) => p.hero_id).sort();
    if (picks.join() !== heroes.join()) return `team ${team} picks ${picks} ≠ players ${heroes}`;
  }
  return null;
}

const isMain = process.argv[1]?.endsWith('import-draft-seed.ts');
if (isMain) {
  const files = process.argv.slice(2).length
    ? process.argv.slice(2)
    : readdirSync(DRAFT_CACHE_DIR)
        .filter((f) => f.endsWith('.txt'))
        .map((f) => join(DRAFT_CACHE_DIR, f));
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    const league = Number(/league (\d+)/.exec(text)?.[1] ?? 19719);
    const matches = decodeSeed(text, league);
    for (const m of matches) writeJson(join(DRAFT_CACHE_DIR, `${m.match_id}.json`), m, false);
    console.log(`${f}: ${matches.length} drafts → ${DRAFT_CACHE_DIR}`);
  }
}
