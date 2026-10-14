// PRD §7.5: derive positions 1–5 per team from lane_role and net worth.
import type { RoleLabel } from '../../src/game/types';
import type { ODMatch, ODPlayer } from './opendota';

export const ROLE_LABELS: Record<1 | 2 | 3 | 4 | 5, RoleLabel> = {
  1: 'Carry',
  2: 'Mid',
  3: 'Offlane',
  4: 'Soft Support',
  5: 'Hard Support',
};

export const isRadiant = (p: ODPlayer) => p.isRadiant ?? p.player_slot < 128;

/** Net worth, falling back to GPM (same ordering within one match) when net_worth is absent. */
export const worth = (p: ODPlayer) => p.net_worth ?? p.gold_per_min ?? 0;

export type TeamRoles = { ok: true; pos: Map<number, 1 | 2 | 3 | 4 | 5> } | { ok: false; reason: string };

export function deriveTeamRoles(team: ODPlayer[]): TeamRoles {
  if (team.length !== 5) return { ok: false, reason: `team has ${team.length} players` };
  const pos = new Map<number, 1 | 2 | 3 | 4 | 5>();
  for (const lane of [1, 2, 3] as const) {
    const inLane = team.filter((p) => p.lane_role === lane);
    if (!inLane.length) return { ok: false, reason: `no player with lane_role ${lane}` };
    const top = [...inLane].sort((a, b) => worth(b) - worth(a));
    if (top[1] && worth(top[0]) === worth(top[1])) return { ok: false, reason: `tie for lane ${lane}` };
    pos.set(top[0].player_slot, lane);
  }
  const rest = team.filter((p) => !pos.has(p.player_slot)).sort((a, b) => worth(b) - worth(a));
  if (rest.length !== 2) return { ok: false, reason: 'conflict assigning supports' };
  // A "support" out-farming every core is a red flag for a mis-assigned role.
  const minCore = Math.min(...team.filter((p) => pos.has(p.player_slot)).map(worth));
  if (worth(rest[0]) > minCore * 1.25) return { ok: false, reason: 'support out-farms a core (needs_review)' };
  pos.set(rest[0].player_slot, 4);
  pos.set(rest[1].player_slot, 5);
  return { ok: true, pos };
}

/** Roles for all 10 players; slots on a conflicting team map to null (needs_review). */
export function deriveRoles(m: ODMatch): Map<number, 1 | 2 | 3 | 4 | 5 | null> {
  const out = new Map<number, 1 | 2 | 3 | 4 | 5 | null>();
  for (const side of [true, false]) {
    const team = m.players.filter((p) => isRadiant(p) === side);
    const r = deriveTeamRoles(team);
    for (const p of team) out.set(p.player_slot, r.ok ? r.pos.get(p.player_slot)! : null);
  }
  return out;
}
