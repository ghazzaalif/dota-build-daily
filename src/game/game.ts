// Game state machine (PRD §5). Pure reducer; persistence lives in useGame.
import { BUILD_SIZE, MAX_ROWS } from '../config';
import { autoLevel, earliestUnsolvedSlot, MAX_HINT_LEVEL } from './hints';
import { isWinningRow, scoreRow } from './scoring';
import type { SavedGame } from './storage';
import type { ItemsMap, ScoredTile } from './types';

export interface GameState {
  rows: string[][];
  scored: ScoredTile[][];
  current: (string | null)[];
  hintsRevealed: number;
  earlyReveals: number;
  lifeline: { slot: number; key: string } | null;
  status: 'in_progress' | 'won' | 'lost';
  keepGreens: boolean;
  /** Last validation error (shown as a toast), cleared on the next action. */
  error: string | null;
  /** Bumped on every submit so the UI can animate the newest row. */
  submitSeq: number;
}

export type GameAction =
  | { type: 'add'; key: string }
  | { type: 'clear'; slot: number }
  | { type: 'clearAll' }
  | { type: 'move'; slot: number; dir: -1 | 1 }
  | { type: 'swap'; from: number; to: number }
  /** Put an item into a specific slot (dragged from an earlier row or the item tree). */
  | { type: 'place'; slot: number; key: string }
  | { type: 'submit' }
  | { type: 'revealHint' }
  | { type: 'setKeepGreens'; value: boolean };

export interface GameContext {
  answer: string[];
  items: ItemsMap;
}

const emptyRow = (): (string | null)[] => Array(BUILD_SIZE).fill(null);

export function solvedSlots(scored: ScoredTile[][]): boolean[] {
  return Array.from({ length: BUILD_SIZE }, (_, i) => scored.some((r) => r[i]?.state === 'green'));
}

function lockLifeline(row: (string | null)[], lifeline: GameState['lifeline']): (string | null)[] {
  if (!lifeline) return row;
  const out = row.map((k) => (k === lifeline.key ? null : k));
  out[lifeline.slot] = lifeline.key;
  return out;
}

function nextRow(s: GameState, lastScored: ScoredTile[] | undefined): (string | null)[] {
  let row = emptyRow();
  if (s.keepGreens && lastScored) row = lastScored.map((t) => (t.state === 'green' ? t.key : null));
  return lockLifeline(row, s.lifeline);
}

function withLifeline(s: GameState, ctx: GameContext): GameState {
  if (s.hintsRevealed < MAX_HINT_LEVEL || s.lifeline) return s;
  const slot = earliestUnsolvedSlot(solvedSlots(s.scored));
  const lifeline = { slot, key: ctx.answer[slot] };
  return { ...s, lifeline, current: lockLifeline(s.current, lifeline) };
}

export function initGame(ctx: GameContext, saved: SavedGame | null, keepGreens: boolean): GameState {
  const rows = saved?.rows ?? [];
  const scored = rows.map((r, i) => scoreRow(ctx.items, r, ctx.answer, rows.slice(0, i)));
  let s: GameState = {
    rows,
    scored,
    current: emptyRow(),
    hintsRevealed: saved?.hintsRevealed ?? 0,
    earlyReveals: saved?.earlyReveals ?? 0,
    lifeline: saved?.lifeline ?? null,
    status: saved?.status ?? 'in_progress',
    keepGreens,
    error: null,
    submitSeq: 0,
  };
  s.current = nextRow(s, scored[scored.length - 1]);
  if (saved?.draft && saved.draft.length === BUILD_SIZE && s.status === 'in_progress') {
    s.current = lockLifeline(saved.draft, s.lifeline);
  }
  s = withLifeline(s, ctx);
  return s;
}

export function toSaved(s: GameState): SavedGame {
  return {
    rows: s.rows,
    hintsRevealed: s.hintsRevealed,
    earlyReveals: s.earlyReveals,
    lifeline: s.lifeline,
    status: s.status,
    draft: s.status === 'in_progress' ? s.current : undefined,
  };
}

export function isLocked(s: GameState, slot: number) {
  return s.lifeline?.slot === slot;
}

export function validateRow(s: GameState): string | null {
  if (s.current.some((k) => !k)) return `Fill all ${BUILD_SIZE} slots first`;
  const keys = s.current as string[];
  if (new Set(keys).size !== keys.length) return 'Each item can only appear once';
  if (s.rows.some((r) => r.join() === keys.join())) return 'You already tried that exact build';
  return null;
}

export function gameReducer(ctx: GameContext) {
  return (state: GameState, action: GameAction): GameState => {
    const s: GameState = { ...state, error: null };
    const playing = s.status === 'in_progress';

    switch (action.type) {
      case 'setKeepGreens':
        return { ...s, keepGreens: action.value };

      case 'add': {
        if (!playing || s.current.includes(action.key)) return s;
        const idx = s.current.findIndex((k, i) => !k && !isLocked(s, i));
        if (idx === -1) return { ...s, error: 'Row is full — tap a slot to clear it' };
        const current = [...s.current];
        current[idx] = action.key;
        return { ...s, current };
      }

      case 'clear': {
        if (!playing || isLocked(s, action.slot)) return s;
        const current = [...s.current];
        current[action.slot] = null;
        return { ...s, current };
      }

      case 'clearAll':
        if (!playing) return s;
        return { ...s, current: lockLifeline(emptyRow(), s.lifeline) };

      case 'move':
        return gameReducer(ctx)(s, { type: 'swap', from: action.slot, to: action.slot + action.dir });

      case 'swap': {
        const { from, to } = action;
        if (!playing || to < 0 || to >= BUILD_SIZE || from === to) return s;
        if (isLocked(s, from) || isLocked(s, to)) return s;
        const current = [...s.current];
        [current[from], current[to]] = [current[to], current[from]];
        return { ...s, current };
      }

      case 'place': {
        const { slot, key } = action;
        if (!playing || slot < 0 || slot >= BUILD_SIZE || isLocked(s, slot) || !ctx.items[key]?.eligible) return s;
        if (s.lifeline?.key === key) return s; // the lifeline item stays in its locked slot
        const current = [...s.current];
        const from = current.indexOf(key);
        if (from === slot) return s;
        // Already in the row: move it, and the item it lands on takes its old slot.
        if (from !== -1) current[from] = current[slot];
        current[slot] = key;
        return { ...s, current };
      }

      case 'submit': {
        if (!playing) return s;
        const err = validateRow(s);
        if (err) return { ...s, error: err };
        const guess = s.current as string[];
        const tiles = scoreRow(ctx.items, guess, ctx.answer, s.rows);
        const rows = [...s.rows, guess];
        const scored = [...s.scored, tiles];
        let next: GameState = { ...s, rows, scored, submitSeq: s.submitSeq + 1 };
        if (isWinningRow(tiles)) return { ...next, status: 'won', current: emptyRow() };
        if (rows.length >= MAX_ROWS) return { ...next, status: 'lost', current: emptyRow() };
        next.hintsRevealed = Math.max(next.hintsRevealed, autoLevel(rows.length));
        next.current = nextRow(next, tiles);
        return withLifeline(next, ctx);
      }

      case 'revealHint': {
        if (!playing || s.hintsRevealed >= MAX_HINT_LEVEL) return s;
        const next = {
          ...s,
          hintsRevealed: Math.max(s.hintsRevealed, autoLevel(s.rows.length)) + 1,
          earlyReveals: s.earlyReveals + 1,
        };
        return withLifeline(next, ctx);
      }
    }
  };
}
