// Picks one candidate per date: S7 cooldowns, S8 role mix, then the §7.2 ranking
// (win > stage > seeded random). Deterministic for the same inputs.
import { HERO_COOLDOWN_DAYS, MATCH_COOLDOWN_DAYS, MAX_SUPPORT_PER_WEEK } from '../../src/config';
import { addDays } from '../../src/game/date';
import type { Candidate } from './candidates';

export interface HistoryEntry {
  date: string;
  candidateId: string;
  matchId: number;
  heroId: number;
  pos: number;
}

/** FNV-1a 32-bit — a tiny seeded hash so "random" tie-breaks are reproducible (seed = date). */
export function seededHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function rankCandidates(pool: Candidate[], date: string): Candidate[] {
  return [...pool].sort(
    (a, b) =>
      Number(b.win) - Number(a.win) ||
      b.stageRank - a.stageRank ||
      seededHash(`${date}|${a.id}`) - seededHash(`${date}|${b.id}`) ||
      a.id.localeCompare(b.id),
  );
}

export function eligibleForDate(pool: Candidate[], date: string, history: HistoryEntry[]): Candidate[] {
  const within = (days: number) => history.filter((h) => h.date < date && h.date >= addDays(date, -days));
  const recentHeroes = new Set(within(HERO_COOLDOWN_DAYS).map((h) => h.heroId));
  const recentMatches = new Set(within(MATCH_COOLDOWN_DAYS).map((h) => h.matchId));
  const supportsThisWeek = within(6).filter((h) => h.pos >= 4).length;
  const usedIds = new Set(history.map((h) => h.candidateId));

  return pool.filter(
    (c) =>
      !usedIds.has(c.id) &&
      !recentHeroes.has(c.heroId) && // S7 hero cooldown
      !recentMatches.has(c.matchId) && // S7 match cooldown
      !(c.pos >= 4 && supportsThisWeek >= MAX_SUPPORT_PER_WEEK), // S8 role mix
  );
}

export function pickForDate(pool: Candidate[], date: string, history: HistoryEntry[]): Candidate | null {
  return rankCandidates(eligibleForDate(pool, date, history), date)[0] ?? null;
}
