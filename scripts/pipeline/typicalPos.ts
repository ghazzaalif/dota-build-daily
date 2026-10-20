// Draft PRD §7.5: each hero's most common pro position on the current patch. Used only to
// group the hero picker, never for scoring.
import { TYPICAL_POS_MIN_GAMES } from '../../src/config';
import type { Pos } from '../../src/game/draft/types';
import type { ODMatch } from './opendota';
import { deriveTeamRoles, isRadiant } from './roles';

export type PosCounts = Map<number, [number, number, number, number, number]>;

/** Position counts per hero across every team whose roles resolve cleanly. */
export function countPositions(matches: ODMatch[]): PosCounts {
  const out: PosCounts = new Map();
  for (const m of matches) {
    for (const side of [true, false]) {
      const team = m.players.filter((p) => isRadiant(p) === side);
      const r = deriveTeamRoles(team);
      if (!r.ok) continue;
      for (const p of team) {
        const c = out.get(p.hero_id) ?? [0, 0, 0, 0, 0];
        c[r.pos.get(p.player_slot)! - 1]++;
        out.set(p.hero_id, c);
      }
    }
  }
  return out;
}

/** The most common position (ties → the lower position), or null below the game threshold. */
export function typicalPosFrom(counts: readonly number[] | undefined, minGames = TYPICAL_POS_MIN_GAMES): Pos | null {
  if (!counts) return null;
  const total = counts.reduce((a, b) => a + b, 0);
  if (total < minGames) return null;
  let best = 0;
  counts.forEach((n, i) => n > counts[best] && (best = i));
  return (best + 1) as Pos;
}
