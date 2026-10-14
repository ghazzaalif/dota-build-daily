// PRD §7.2: build (match, player) candidates and apply filters S1–S9 (S7/S8 are
// date-dependent and live in schedule.ts).
import { MIN_DURATION_MIN } from '../../src/config';
import type { AnswerEntry, RoleLabel } from '../../src/game/types';
import { buildAnswer, idToKeyMap } from './answer';
import type { ItemRules, RawItems } from './eligibility';
import type { ODMatch } from './opendota';
import { deriveRoles, isRadiant, ROLE_LABELS } from './roles';

/** S6: bear/clone items pollute the log or duplicate items confuse players. */
export const EXCLUDED_HEROES = new Set([80 /* Lone Druid */, 82 /* Meepo */, 113 /* Arc Warden */]);

export interface League {
  leagueId: number;
  name: string;
  stages: { label: string; from: string; to: string }[];
}

export interface Candidate {
  id: string;
  matchId: number;
  leagueId: number;
  tournament: string;
  stage: string;
  stageRank: number;
  startTime: number;
  patch: string;
  playerSlot: number;
  accountId: number | null;
  heroId: number;
  pos: 1 | 2 | 3 | 4 | 5;
  role: RoleLabel;
  win: boolean;
  durationSec: number;
  answer: AnswerEntry[];
  playerName: string;
  team: string;
  allies: number[];
  enemies: number[];
  radiantTeam: string;
  direTeam: string;
  side: 'radiant' | 'dire';
}

export interface Rejection {
  id: string;
  rule: string;
  detail: string;
}

export interface CandidateContext {
  leagues: League[];
  raw: RawItems;
  rules: ItemRules;
  currentPatch: string;
  patchName: (id: number | undefined) => string | null;
  stageOverrides: Record<string, string>;
  blocked: string[];
}

export function stageFor(m: ODMatch, league: League, overrides: Record<string, string>): string {
  if (overrides[m.match_id]) return overrides[m.match_id];
  const day = new Date(m.start_time * 1000).toISOString().slice(0, 10);
  return league.stages.find((s) => day >= s.from && day <= s.to)?.label ?? 'Main Event';
}

export function stageRank(stage: string): number {
  if (/grand final/i.test(stage)) return 3;
  if (/final|playoff|bracket/i.test(stage)) return 2;
  return 1;
}

export function buildCandidates(matches: ODMatch[], ctx: CandidateContext) {
  const candidates: Candidate[] = [];
  const rejected: Rejection[] = [];
  const reject = (id: string, rule: string, detail = '') => rejected.push({ id, rule, detail });
  const ids = idToKeyMap(ctx.raw);

  for (const m of matches) {
    const league = ctx.leagues.find((l) => l.leagueId === m.leagueid);
    if (!league) {
      reject(String(m.match_id), 'S1', `league ${m.leagueid} not allowlisted`);
      continue;
    }
    if (ctx.blocked.includes(String(m.match_id))) {
      reject(String(m.match_id), 'override', 'match blocked');
      continue;
    }
    if (m.duration < MIN_DURATION_MIN * 60) {
      reject(String(m.match_id), 'S4', `${Math.round(m.duration / 60)} min`);
      continue;
    }
    if (m.players.some((p) => (p.leaver_status ?? 0) > 0)) {
      reject(String(m.match_id), 'S9', 'abandon/disconnect');
      continue;
    }
    const patch = ctx.patchName(m.patch) ?? 'unknown';
    const roles = deriveRoles(m);
    const stage = stageFor(m, league, ctx.stageOverrides);

    for (const p of m.players) {
      const id = `${m.match_id}:${p.account_id ?? `slot${p.player_slot}`}`;
      if (ctx.blocked.includes(id)) {
        reject(id, 'override', 'candidate blocked');
        continue;
      }
      if (!p.purchase_log?.length && !p.first_purchase_time) {
        reject(id, 'S2', 'no purchase_log (parse requested)');
        continue;
      }
      if (EXCLUDED_HEROES.has(p.hero_id)) {
        reject(id, 'S6', `hero ${p.hero_id}`);
        continue;
      }
      const pos = roles.get(p.player_slot);
      if (!pos) {
        reject(id, '§7.5', 'role heuristic conflict → needs_review');
        continue;
      }
      const built = buildAnswer(p, ctx.raw, ctx.rules, ids);
      if (!built.ok) {
        reject(id, 'S5', built.reason);
        continue;
      }
      const answer = built.answer;
      const radiant = isRadiant(p);
      const mates = m.players.filter((q) => isRadiant(q) === radiant);
      const foes = m.players.filter((q) => isRadiant(q) !== radiant);
      const radiantTeam = m.radiant_team?.name?.trim() || 'Radiant';
      const direTeam = m.dire_team?.name?.trim() || 'Dire';
      candidates.push({
        id,
        matchId: m.match_id,
        leagueId: league.leagueId,
        tournament: league.name,
        stage,
        stageRank: stageRank(stage),
        startTime: m.start_time,
        patch,
        playerSlot: p.player_slot,
        accountId: p.account_id ?? null,
        heroId: p.hero_id,
        pos,
        role: ROLE_LABELS[pos],
        win: radiant === m.radiant_win,
        durationSec: m.duration,
        answer,
        playerName: p.name || p.personaname || 'Unknown player',
        team: radiant ? radiantTeam : direTeam,
        allies: [p.hero_id, ...mates.filter((q) => q !== p).map((q) => q.hero_id)],
        enemies: foes.map((q) => q.hero_id),
        radiantTeam,
        direTeam,
        side: radiant ? 'radiant' : 'dire',
      });
    }
  }
  return { candidates, rejected };
}

/**
 * S3: current patch only, unless the pool is too small; then previous-patch candidates
 * are allowed when every answer item still exists unchanged.
 */
export function applyPatchRule(
  all: Candidate[],
  currentPatch: string,
  previousPatch: string | null,
  minPool: number,
  itemUnchanged: (key: string) => boolean,
): { pool: Candidate[]; usedFallback: boolean } {
  const current = all.filter((c) => c.patch === currentPatch);
  if (current.length >= minPool || !previousPatch) return { pool: current, usedFallback: false };
  const prev = all.filter((c) => c.patch === previousPatch && c.answer.every((a) => itemUnchanged(a.key)));
  return { pool: [...current, ...prev], usedFallback: prev.length > 0 };
}
