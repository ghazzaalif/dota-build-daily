// §8 steps 5–7: fill the private queue, validate, publish puzzles with date ≤ tomorrow.
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD_SIZE } from '../../src/config';
import { answerKey, decodeAnswer, encodeAnswer } from '../../src/game/answer';
import { puzzleNumber } from '../../src/game/date';
import { priceBand } from '../../src/game/hints';
import type { HeroesMap, ItemsMap, Puzzle, PuzzleIndex } from '../../src/game/types';
import type { Candidate } from './candidates';
import { readJson, writeJson } from './opendota';
import type { HistoryEntry } from './schedule';

const ROOT = process.cwd();
/** Private queue. In production this directory lives in a private repo / encrypted artifact (§8). */
export const QUEUE_DIR = process.env.DBD_QUEUE_DIR ?? join(ROOT, 'queue');
export const PUBLIC_DIR = join(ROOT, 'public', 'puzzles');
export const HISTORY_FILE = join(QUEUE_DIR, 'history.json');

export interface QueuedPuzzle {
  puzzle: Puzzle;
  candidateId: string;
}

export function toPuzzle(c: Candidate, date: string, items: ItemsMap, heroes: HeroesMap): Puzzle {
  const no = puzzleNumber(date);
  const hero = heroes[c.heroId];
  return {
    puzzleNo: no,
    date,
    patch: c.patch,
    hero: { id: c.heroId, key: hero?.key ?? String(c.heroId), name: hero?.name ?? `Hero ${c.heroId}` },
    role: { pos: c.pos, label: c.role },
    tournament: { leagueId: c.leagueId, name: c.tournament, stage: c.stage },
    hints: {
      allies: c.allies,
      enemies: c.enemies,
      result: c.win ? 'win' : 'loss',
      durationSec: c.durationSec,
      player: { name: c.playerName, team: c.team },
      priceBands: c.answer.map((a) => priceBand(items[a.key]?.cost ?? 0)),
    },
    match: { matchId: c.matchId, radiantTeam: c.radiantTeam, direTeam: c.direTeam, playerSide: c.side },
    answer: encodeAnswer(c.answer, answerKey(date, no)),
  };
}

/** §8 step 6: schema check + every answer item exists (and is eligible) in current constants. */
export function validatePuzzle(p: Puzzle, items: ItemsMap, heroes: HeroesMap): string[] {
  const errors: string[] = [];
  const need = (cond: unknown, msg: string) => !cond && errors.push(msg);
  need(/^\d{4}-\d{2}-\d{2}$/.test(p.date), 'date format');
  need(p.puzzleNo === puzzleNumber(p.date), 'puzzleNo does not match date');
  need(heroes[p.hero.id], `unknown hero ${p.hero.id}`);
  need(p.role.pos >= 1 && p.role.pos <= 5, 'role.pos');
  need(p.hints.allies.length === 5 && p.hints.enemies.length === 5, 'draft must have 5 v 5');
  need(p.hints.priceBands.length === BUILD_SIZE, 'priceBands length');
  need(Number.isInteger(p.match.matchId), 'matchId');
  let answer: { key: string; timeSec: number }[] = [];
  try {
    answer = decodeAnswer(p.answer, answerKey(p.date, p.puzzleNo));
  } catch {
    errors.push('answer does not decode');
  }
  need(answer.length === BUILD_SIZE, `answer has ${answer.length} items`);
  need(new Set(answer.map((a) => a.key)).size === answer.length, 'answer has duplicates');
  for (const a of answer) need(items[a.key]?.eligible, `answer item ${a.key} missing/ineligible in current constants`);
  for (let i = 1; i < answer.length; i++) need(answer[i].timeSec >= answer[i - 1].timeSec, 'answer not in purchase order');
  return errors;
}

export function loadHistory(): HistoryEntry[] {
  return readJson<HistoryEntry[]>(HISTORY_FILE) ?? [];
}
export function saveHistory(h: HistoryEntry[]) {
  writeJson(HISTORY_FILE, [...h].sort((a, b) => a.date.localeCompare(b.date)));
}

export const queuePath = (date: string) => join(QUEUE_DIR, `${date}.json`);
export const loadQueued = (date: string) => readJson<QueuedPuzzle>(queuePath(date));
export const saveQueued = (q: QueuedPuzzle) => writeJson(queuePath(q.puzzle.date), q);

export function removeQueued(date: string) {
  if (existsSync(queuePath(date))) rmSync(queuePath(date));
}

export function queuedDates(): string[] {
  if (!existsSync(QUEUE_DIR)) return [];
  return readdirSync(QUEUE_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort();
}

/**
 * Published puzzles are the source of truth for past days: if the private queue was lost
 * (e.g. an evicted Actions cache), restore them so a live puzzle can never change, and
 * return history entries so cooldowns still apply.
 */
export function restoreFromPublic(): HistoryEntry[] {
  if (!existsSync(PUBLIC_DIR)) return [];
  const out: HistoryEntry[] = [];
  for (const f of readdirSync(PUBLIC_DIR).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    const puzzle = readJson<Puzzle>(join(PUBLIC_DIR, f));
    if (!puzzle) continue;
    const queued = loadQueued(puzzle.date);
    const candidateId = queued?.candidateId ?? `${puzzle.match.matchId}:published`;
    if (!queued) saveQueued({ puzzle, candidateId });
    out.push({ date: puzzle.date, candidateId, matchId: puzzle.match.matchId, heroId: puzzle.hero.id, pos: puzzle.role.pos });
  }
  return out;
}

/** §8 step 7 + spoiler safety: only puzzles with date ≤ `lastPublic` reach /public. */
export function publishUpTo(lastPublic: string): string[] {
  const published: string[] = [];
  for (const date of queuedDates()) {
    if (date > lastPublic) continue;
    const q = loadQueued(date)!;
    writeJson(join(PUBLIC_DIR, `${date}.json`), q.puzzle);
    published.push(date);
  }
  const index: PuzzleIndex = {
    dates: existsSync(PUBLIC_DIR)
      ? readdirSync(PUBLIC_DIR)
          .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
          .map((f) => f.slice(0, 10))
          .sort()
      : [],
  };
  writeJson(join(PUBLIC_DIR, 'index.json'), index);
  return published;
}
