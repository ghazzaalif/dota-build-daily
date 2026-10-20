// Draft Daily pipeline step (requirements/dota-draft-daily-prd.md §7–8):
// candidates (filters D1–D7), the answer from picks_bans (§7.4), validation, and the
// per-date pick (D8–D10 + §7.3 ranking). No extra API calls: picks_bans comes with /matches.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  DRAFT_MIN_DURATION_MIN,
  EXPECTED_BANS,
  EXPECTED_PICKS,
  TEAM_COOLDOWN_DAYS,
  TEAM_SIZE,
} from '../../src/config';
import { decodeSecret, encodeSecret } from '../../src/game/answer';
import { addDays } from '../../src/game/date';
import { draftPuzzleNumber, draftSecretKey } from '../../src/game/draft/date';
import type { DraftEntry, DraftPuzzle, DraftSecret, Pos } from '../../src/game/draft/types';
import type { HeroAttr, HeroesMap } from '../../src/game/types';
import { stageFor, stageRank, type League } from './candidates';
import { CACHE_DIR, matchCachePath, readJson, type ODMatch, type ODPlayer } from './opendota';
import { deriveTeamRoles, isRadiant } from './roles';
import { seededHash } from './schedule';

/** Per-match draft cache: {matchId}.json with picks_bans + the player fields Draft needs. */
export const DRAFT_CACHE_DIR = join(CACHE_DIR, 'drafts');

export interface DraftCandidate {
  /** `${matchId}:radiant|dire` — the hidden side. */
  id: string;
  matchId: number;
  leagueId: number;
  tournament: string;
  stage: string;
  stageRank: number;
  patch: string;
  hiddenSide: 'radiant' | 'dire';
  hiddenTeam: string;
  enemyTeam: string;
  radiantTeam: string;
  direTeam: string;
  win: boolean;
  durationSec: number;
  hiddenHadFirstPick: boolean;
  draft: DraftEntry[];
  answer: number[];
  positions: Pos[];
  players: string[];
  attributes: HeroAttr[];
}

export interface DraftRejection {
  id: string;
  rule: string;
  detail: string;
}

export interface DraftHistoryEntry {
  date: string;
  candidateId: string;
  matchId: number;
  hiddenTeam: string;
}

export interface DraftContext {
  leagues: League[];
  currentPatch: string;
  patchName: (id: number | undefined) => string | null;
  stageOverrides: Record<string, string>;
  blocked: string[];
  heroes: HeroesMap;
}

export const hasDraft = (m: ODMatch | null | undefined): boolean => !!m?.picks_bans?.length;

/** Draft source for a match: the full cached match when it has picks_bans, else the draft cache. */
export function loadDraftSource(id: number): ODMatch | null {
  const full = readJson<ODMatch>(matchCachePath(id));
  if (full && hasDraft(full)) return full;
  const d = readJson<ODMatch>(join(DRAFT_CACHE_DIR, `${id}.json`));
  return d && hasDraft(d) ? d : null;
}

/** Every cached match with a draft (full match cache + draft cache), deduplicated. */
export function loadAllDraftSources(): ODMatch[] {
  const ids = new Set<number>();
  for (const dir of [join(CACHE_DIR, 'matches'), DRAFT_CACHE_DIR]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (/^\d+\.json$/.test(f)) ids.add(Number(f.slice(0, -5)));
  }
  return [...ids]
    .sort((a, b) => a - b)
    .map(loadDraftSource)
    .filter((m): m is ODMatch => m !== null);
}

/** Keeps only the fields Draft needs, so the draft cache stays small. */
export function slimDraft(m: ODMatch): ODMatch {
  return {
    match_id: m.match_id,
    leagueid: m.leagueid,
    start_time: m.start_time,
    duration: m.duration,
    radiant_win: m.radiant_win,
    patch: m.patch,
    game_mode: m.game_mode,
    radiant_team: m.radiant_team ? { name: m.radiant_team.name } : null,
    dire_team: m.dire_team ? { name: m.dire_team.name } : null,
    picks_bans: m.picks_bans,
    players: m.players.map((p) => ({
      player_slot: p.player_slot,
      isRadiant: p.isRadiant,
      hero_id: p.hero_id,
      lane_role: p.lane_role,
      net_worth: p.net_worth,
      gold_per_min: p.gold_per_min,
      leaver_status: p.leaver_status,
      account_id: p.account_id,
      name: p.name,
      personaname: p.personaname,
    })),
    _source: m._source ?? 'opendota-matches',
  };
}

const playerName = (p: ODPlayer) => p.name?.trim() || p.personaname?.trim() || 'Unknown player';

export function buildDraftCandidates(matches: ODMatch[], ctx: DraftContext) {
  const candidates: DraftCandidate[] = [];
  const rejected: DraftRejection[] = [];
  const reject = (id: string, rule: string, detail = '') => rejected.push({ id, rule, detail });

  for (const m of matches) {
    const mid = String(m.match_id);
    const league = ctx.leagues.find((l) => l.leagueId === m.leagueid);
    if (!league) {
      reject(mid, 'D1', `league ${m.leagueid} not allowlisted`);
      continue;
    }
    if (ctx.blocked.includes(mid)) {
      reject(mid, 'override', 'match blocked');
      continue;
    }
    const pb = [...(m.picks_bans ?? [])].sort((a, b) => a.order - b.order);
    const picks = pb.filter((x) => x.is_pick);
    const bans = pb.filter((x) => !x.is_pick);
    if (
      m.game_mode !== 2 ||
      picks.length !== EXPECTED_PICKS ||
      bans.length !== EXPECTED_BANS ||
      [0, 1].some((t) => picks.filter((x) => x.team === t).length !== TEAM_SIZE) ||
      new Set(pb.map((x) => x.hero_id)).size !== pb.length
    ) {
      reject(mid, 'D2', `mode ${m.game_mode}, ${picks.length} picks / ${bans.length} bans`);
      continue;
    }
    if (m.duration < DRAFT_MIN_DURATION_MIN * 60) {
      reject(mid, 'D4', `${Math.round(m.duration / 60)} min`);
      continue;
    }
    if (m.players.some((p) => (p.leaver_status ?? 0) > 0)) {
      reject(mid, 'D5', 'abandon/disconnect');
      continue;
    }
    const patch = ctx.patchName(m.patch) ?? 'unknown';
    const stage = stageFor(m, league, ctx.stageOverrides);
    const radiantTeam = m.radiant_team?.name?.trim() || 'Radiant';
    const direTeam = m.dire_team?.name?.trim() || 'Dire';
    const firstPickTeam = picks[0].team;

    for (const side of ['radiant', 'dire'] as const) {
      const team = side === 'radiant' ? 0 : 1;
      const id = `${mid}:${side}`;
      if (ctx.blocked.includes(id)) {
        reject(id, 'override', 'candidate blocked');
        continue;
      }
      const roster = m.players.filter((p) => isRadiant(p) === (side === 'radiant'));
      const roles = deriveTeamRoles(roster);
      if (!roles.ok) {
        reject(id, 'D6', roles.reason);
        continue;
      }
      // §7.4: hidden picks in order → slots 1–5.
      const hiddenPicks = picks.filter((x) => x.team === team);
      const slotPlayers = hiddenPicks.map((x) => roster.filter((p) => p.hero_id === x.hero_id));
      if (slotPlayers.some((ps) => ps.length !== 1)) {
        reject(id, 'D7', 'a hidden pick does not map to exactly one player');
        continue;
      }
      const unknownHero = pb.find((x) => !ctx.heroes[x.hero_id]);
      if (unknownHero) {
        reject(id, 'D2', `unknown hero ${unknownHero.hero_id}`);
        continue;
      }
      let slot = 0;
      const draft: DraftEntry[] = pb.map((x) => {
        const t = x.team === team ? ('hidden' as const) : ('enemy' as const);
        if (x.is_pick && t === 'hidden') return { order: x.order, type: 'pick', team: t, slot: ++slot };
        return { order: x.order, type: x.is_pick ? 'pick' : 'ban', team: t, heroId: x.hero_id };
      });
      candidates.push({
        id,
        matchId: m.match_id,
        leagueId: league.leagueId,
        tournament: league.name,
        stage,
        stageRank: stageRank(stage),
        patch,
        hiddenSide: side,
        hiddenTeam: side === 'radiant' ? radiantTeam : direTeam,
        enemyTeam: side === 'radiant' ? direTeam : radiantTeam,
        radiantTeam,
        direTeam,
        win: (side === 'radiant') === m.radiant_win,
        durationSec: m.duration,
        hiddenHadFirstPick: firstPickTeam === team,
        draft,
        answer: hiddenPicks.map((x) => x.hero_id),
        positions: slotPlayers.map(([p]) => roles.pos.get(p.player_slot)!),
        players: slotPlayers.map(([p]) => playerName(p)),
        attributes: hiddenPicks.map((x) => ctx.heroes[x.hero_id]?.attr ?? 'all'),
      });
    }
  }
  return { candidates, rejected };
}

/** D3: current patch only, unless the pool is too small; then the previous patch too. */
export function applyDraftPatchRule(all: DraftCandidate[], current: string, previous: string | null, minPool: number) {
  const now = all.filter((c) => c.patch === current);
  if (now.length >= minPool || !previous) return { pool: now, usedFallback: false };
  const prev = all.filter((c) => c.patch === previous);
  return { pool: [...now, ...prev], usedFallback: prev.length > 0 };
}

/** §7.3: winning team first, then recognizable stages, then a seeded shuffle (seed = date). */
export function rankDraftCandidates(pool: DraftCandidate[], date: string): DraftCandidate[] {
  return [...pool].sort(
    (a, b) =>
      Number(b.win) - Number(a.win) ||
      b.stageRank - a.stageRank ||
      seededHash(`draft|${date}|${a.id}`) - seededHash(`draft|${date}|${b.id}`) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * D8 one puzzle per match, ever · D9 never a match the other mode used · D10 the same hidden
 * team not on consecutive days.
 */
export function eligibleDraftsForDate(
  pool: DraftCandidate[],
  date: string,
  history: DraftHistoryEntry[],
  usedByOtherMode: ReadonlySet<number>,
): DraftCandidate[] {
  const usedMatches = new Set(history.map((h) => h.matchId));
  const recentTeams = new Set(
    history.filter((h) => h.date < date && h.date >= addDays(date, -TEAM_COOLDOWN_DAYS)).map((h) => h.hiddenTeam),
  );
  return pool.filter((c) => !usedMatches.has(c.matchId) && !usedByOtherMode.has(c.matchId) && !recentTeams.has(c.hiddenTeam));
}

export function pickDraftForDate(
  pool: DraftCandidate[],
  date: string,
  history: DraftHistoryEntry[],
  usedByOtherMode: ReadonlySet<number>,
): DraftCandidate | null {
  return rankDraftCandidates(eligibleDraftsForDate(pool, date, history, usedByOtherMode), date)[0] ?? null;
}

export function toDraftPuzzle(c: DraftCandidate, date: string): DraftPuzzle {
  const no = draftPuzzleNumber(date);
  const secret: DraftSecret = {
    answer: c.answer,
    match: { matchId: c.matchId, radiantTeam: c.radiantTeam, direTeam: c.direTeam },
  };
  return {
    mode: 'draft',
    puzzleNo: no,
    date,
    patch: c.patch,
    tournament: { leagueId: c.leagueId, name: c.tournament, stage: c.stage },
    hiddenSide: c.hiddenSide,
    hiddenHadFirstPick: c.hiddenHadFirstPick,
    draft: c.draft,
    hints: {
      positions: c.positions,
      teams: { hidden: c.hiddenTeam, enemy: c.enemyTeam },
      result: c.win ? 'win' : 'loss',
      durationSec: c.durationSec,
      players: c.players,
      attributes: c.attributes,
    },
    secret: encodeSecret(secret, draftSecretKey(date, no)),
  };
}

export function decodeDraftSecret(p: DraftPuzzle): DraftSecret {
  return decodeSecret<DraftSecret>(p.secret, draftSecretKey(p.date, p.puzzleNo));
}

/** §8 step 6 for Draft: schema check + every hero ID exists in current constants. */
export function validateDraftPuzzle(p: DraftPuzzle, heroes: HeroesMap): string[] {
  const errors: string[] = [];
  const need = (cond: unknown, msg: string) => !cond && errors.push(msg);
  need(p.mode === 'draft', 'mode');
  need(/^\d{4}-\d{2}-\d{2}$/.test(p.date), 'date format');
  need(p.puzzleNo === draftPuzzleNumber(p.date), 'puzzleNo does not match date');
  const picks = p.draft.filter((e) => e.type === 'pick');
  const bans = p.draft.filter((e) => e.type === 'ban');
  need(picks.length === EXPECTED_PICKS && bans.length === EXPECTED_BANS, `draft has ${picks.length} picks / ${bans.length} bans`);
  need(p.draft.every((e, i) => i === 0 || e.order > p.draft[i - 1].order), 'draft not in order');
  const hidden = picks.filter((e) => e.team === 'hidden');
  need(hidden.map((e) => e.slot).join() === '1,2,3,4,5', 'hidden slots must be 1–5 in order');
  need(hidden.every((e) => e.heroId === undefined), 'hidden pick leaks a hero');
  for (const e of p.draft) if (e.heroId !== undefined) need(heroes[e.heroId], `unknown hero ${e.heroId}`);
  need([...p.hints.positions].sort().join() === '1,2,3,4,5', 'positions must be 1–5 once each');
  need(p.hints.players.length === TEAM_SIZE && p.hints.attributes.length === TEAM_SIZE, 'hint lengths');
  let secret: DraftSecret | null = null;
  try {
    secret = decodeDraftSecret(p);
  } catch {
    errors.push('secret does not decode');
  }
  if (secret) {
    need(secret.answer.length === TEAM_SIZE && new Set(secret.answer).size === TEAM_SIZE, 'answer must be 5 distinct heroes');
    for (const h of secret.answer) need(heroes[h], `answer hero ${h} missing in current constants`);
    const visible = new Set(p.draft.map((e) => e.heroId).filter((h) => h !== undefined));
    need(!secret.answer.some((h) => visible.has(h)), 'answer hero also visible on the board');
    need(Number.isInteger(secret.match.matchId), 'matchId');
  }
  return errors;
}
