// Pure rules for the Activity backend: validate an upload, re-score it with the game's
// own scoring code, and compute stats. No I/O here so it's easy to test.
import { BUILD_SIZE, MAX_ROWS } from '../src/config';
import { answerKey, decodeAnswer } from '../src/game/answer';
import { MAX_HINT_LEVEL } from '../src/game/hints';
import { isWinningRow, scoreRow } from '../src/game/scoring';
import { emptyStats, recordResult, type Stats } from '../src/game/storage';
import type { ItemsMap, Puzzle, TileState } from '../src/game/types';
import type { GameUpload } from '../src/discord/api';

export type Status = 'in_progress' | 'won' | 'lost';

export interface StoredGame {
  userId: string;
  date: string;
  puzzleNo: number;
  rows: string[][];
  states: TileState[][];
  status: Status;
  hintsRevealed: number;
  earlyReveals: number;
  lifeline: { slot: number; key: string } | null;
}

export class UploadError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Shape check only; the content check needs the puzzle (see scoreUpload). */
export function parseUpload(body: unknown): GameUpload {
  const b = body as Partial<GameUpload> | null;
  if (!b || typeof b !== 'object') throw new UploadError('Body must be a JSON object');
  if (!isDate(b.date)) throw new UploadError('date must be YYYY-MM-DD');
  if (!Array.isArray(b.rows) || b.rows.length > MAX_ROWS) throw new UploadError(`rows must be an array of at most ${MAX_ROWS}`);
  for (const r of b.rows) {
    if (!Array.isArray(r) || r.length !== BUILD_SIZE || r.some((k) => typeof k !== 'string' || k.length > 64)) {
      throw new UploadError(`each row must be ${BUILD_SIZE} item keys`);
    }
  }
  const int = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : 0);
  let lifeline: GameUpload['lifeline'] = null;
  if (b.lifeline && typeof b.lifeline === 'object') {
    const l = b.lifeline as { slot?: unknown; key?: unknown };
    if (Number.isInteger(l.slot) && typeof l.key === 'string') lifeline = { slot: l.slot as number, key: l.key };
  }
  const snowflake = (v: unknown) => (typeof v === 'string' && /^\d{5,25}$/.test(v) ? v : null);
  const guildId = snowflake(b.guildId);
  return {
    date: b.date,
    rows: b.rows as string[][],
    hintsRevealed: int(b.hintsRevealed, MAX_HINT_LEVEL),
    earlyReveals: int(b.earlyReveals, MAX_HINT_LEVEL),
    lifeline,
    guildId,
    channelId: guildId ? snowflake(b.channelId) : null,
  };
}

/**
 * Re-scores an upload against the real answer. Rows already stored can't be rewritten,
 * and nothing changes once a game is finished. Returns the game to store.
 */
export function scoreUpload(
  userId: string,
  upload: GameUpload,
  puzzle: Puzzle,
  items: ItemsMap,
  previous: StoredGame | null,
): StoredGame {
  if (previous && previous.status !== 'in_progress') return previous;
  for (const r of upload.rows) {
    if (new Set(r).size !== r.length) throw new UploadError('items in a row must be distinct');
    for (const k of r) if (!items[k]?.eligible) throw new UploadError(`unknown item ${k}`);
  }
  const prevRows = previous?.rows ?? [];
  if (upload.rows.length < prevRows.length || prevRows.some((r, i) => r.join() !== upload.rows[i].join())) {
    throw new UploadError('earlier rows cannot be changed', 409);
  }
  const answer = decodeAnswer(puzzle.answer, answerKey(puzzle.date, puzzle.puzzleNo)).map((a) => a.key);
  const states: TileState[][] = [];
  let status: Status = 'in_progress';
  const rows: string[][] = [];
  for (const r of upload.rows) {
    const tiles = scoreRow(items, r, answer, rows);
    rows.push(r);
    states.push(tiles.map((t) => t.state));
    if (isWinningRow(tiles)) {
      status = 'won';
      break;
    }
  }
  if (status === 'in_progress' && rows.length >= MAX_ROWS) status = 'lost';
  return {
    userId,
    date: puzzle.date,
    puzzleNo: puzzle.puzzleNo,
    rows,
    states,
    status,
    hintsRevealed: Math.max(upload.hintsRevealed, previous?.hintsRevealed ?? 0),
    earlyReveals: Math.max(upload.earlyReveals, previous?.earlyReveals ?? 0),
    lifeline: upload.lifeline ?? previous?.lifeline ?? null,
  };
}

/** Stats from finished games, in date order, using the same streak rules as the website. */
export function statsFromGames(games: Pick<StoredGame, 'date' | 'status' | 'rows'>[]): Stats {
  return [...games]
    .filter((g) => g.status !== 'in_progress')
    .sort((a, b) => a.date.localeCompare(b.date))
    .reduce((s, g) => recordResult(s, g.date, g.status === 'won', g.rows.length), emptyStats());
}

const ORDER: Record<Status, number> = { won: 0, lost: 1, in_progress: 2 };

/** Winners first (fewest rows, then fewest hints), then losses, then people still playing. */
export function sortBoard<T extends { status: Status; rows: number; hints: number; name: string }>(entries: T[]): T[] {
  return [...entries].sort(
    (a, b) =>
      ORDER[a.status] - ORDER[b.status] ||
      (a.status === 'won' ? a.rows - b.rows || a.hints - b.hints : b.rows - a.rows) ||
      a.name.localeCompare(b.name),
  );
}
