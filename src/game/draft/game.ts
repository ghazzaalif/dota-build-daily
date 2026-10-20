// Draft game state machine (Draft PRD §5). Pure reducer; persistence lives in useDraftGame.
import { MAX_ROWS, TEAM_SIZE } from '../../config';
import { earliestUnsolvedSlot } from '../hints';
import { autoDraftLevel, LIFELINE_LEVEL, MAX_DRAFT_HINT_LEVEL } from './hints';
import { isWinningDraftRow, scoreDraft } from './scoring';
import type { DraftSaved } from './storage';
import type { DraftPuzzle, DraftTile } from './types';

export interface DraftState {
  rows: number[][];
  scored: DraftTile[][];
  current: (number | null)[];
  hintsRevealed: number;
  earlyReveals: number;
  /** Slot index (0-based) and hero locked by the lifeline. */
  lifeline: { slot: number; heroId: number } | null;
  status: 'in_progress' | 'won' | 'lost';
  keepGreens: boolean;
  error: string | null;
  submitSeq: number;
}

export type DraftAction =
  | { type: 'add'; heroId: number }
  | { type: 'clear'; slot: number }
  | { type: 'clearAll' }
  | { type: 'move'; slot: number; dir: -1 | 1 }
  | { type: 'swap'; from: number; to: number }
  | { type: 'submit' }
  | { type: 'revealHint' }
  | { type: 'setKeepGreens'; value: boolean };

export interface DraftContext {
  answer: number[];
  /** Banned and enemy-picked heroes: they can never enter a row (§5.4). */
  unavailable: ReadonlySet<number>;
}

/** Heroes that are neither banned nor picked by the enemy in this draft. */
export function unavailableHeroes(puzzle: Pick<DraftPuzzle, 'draft'>): Set<number> {
  const out = new Set<number>();
  for (const e of puzzle.draft) if (e.heroId !== undefined && (e.type === 'ban' || e.team === 'enemy')) out.add(e.heroId);
  return out;
}

const emptyRow = (): (number | null)[] => Array(TEAM_SIZE).fill(null);

export function solvedDraftSlots(scored: DraftTile[][]): boolean[] {
  return Array.from({ length: TEAM_SIZE }, (_, i) => scored.some((r) => r[i]?.state === 'green'));
}

function lockLifeline(row: (number | null)[], lifeline: DraftState['lifeline']): (number | null)[] {
  if (!lifeline) return row;
  const out = row.map((h) => (h === lifeline.heroId ? null : h));
  out[lifeline.slot] = lifeline.heroId;
  return out;
}

function nextRow(s: DraftState, last: DraftTile[] | undefined): (number | null)[] {
  let row = emptyRow();
  if (s.keepGreens && last) row = last.map((t) => (t.state === 'green' ? t.heroId : null));
  return lockLifeline(row, s.lifeline);
}

function withLifeline(s: DraftState, ctx: DraftContext): DraftState {
  if (s.hintsRevealed < LIFELINE_LEVEL || s.lifeline) return s;
  const slot = earliestUnsolvedSlot(solvedDraftSlots(s.scored));
  const lifeline = { slot, heroId: ctx.answer[slot] };
  return { ...s, lifeline, current: lockLifeline(s.current, lifeline) };
}

export function initDraftGame(ctx: DraftContext, saved: DraftSaved | null, keepGreens: boolean): DraftState {
  const rows = saved?.rows ?? [];
  const scored = rows.map((r) => scoreDraft(r, ctx.answer));
  let s: DraftState = {
    rows,
    scored,
    current: emptyRow(),
    hintsRevealed: Math.max(saved?.hintsRevealed ?? 0, autoDraftLevel(rows.length)),
    earlyReveals: saved?.earlyReveals ?? 0,
    lifeline: saved?.lifeline ?? null,
    status: saved?.status ?? 'in_progress',
    keepGreens,
    error: null,
    submitSeq: 0,
  };
  s.current = nextRow(s, scored[scored.length - 1]);
  if (saved?.draft && saved.draft.length === TEAM_SIZE && s.status === 'in_progress') {
    s.current = lockLifeline(
      saved.draft.map((h) => (h !== null && ctx.unavailable.has(h) ? null : h)),
      s.lifeline,
    );
  }
  return withLifeline(s, ctx);
}

export function toDraftSaved(s: DraftState): DraftSaved {
  return {
    rows: s.rows,
    hintsRevealed: s.hintsRevealed,
    earlyReveals: s.earlyReveals,
    lifeline: s.lifeline,
    status: s.status,
    draft: s.status === 'in_progress' ? s.current : undefined,
  };
}

export const isLockedSlot = (s: DraftState, slot: number) => s.lifeline?.slot === slot;

export function validateDraftRow(s: DraftState, ctx: DraftContext): string | null {
  if (s.current.some((h) => h === null)) return `Pick all ${TEAM_SIZE} heroes first`;
  const ids = s.current as number[];
  if (new Set(ids).size !== ids.length) return 'Each hero can only appear once';
  if (ids.some((h) => ctx.unavailable.has(h))) return 'Banned and enemy heroes can’t be picked';
  if (s.rows.some((r) => r.join() === ids.join())) return 'You already tried that exact draft';
  return null;
}

export function draftReducer(ctx: DraftContext) {
  const reduce = (state: DraftState, action: DraftAction): DraftState => {
    const s: DraftState = { ...state, error: null };
    const playing = s.status === 'in_progress';

    switch (action.type) {
      case 'setKeepGreens':
        return { ...s, keepGreens: action.value };

      case 'add': {
        if (!playing || s.current.includes(action.heroId)) return s;
        if (ctx.unavailable.has(action.heroId)) return { ...s, error: 'That hero is banned or on the enemy team' };
        const idx = s.current.findIndex((h, i) => h === null && !isLockedSlot(s, i));
        if (idx === -1) return { ...s, error: 'Row is full — tap a slot to clear it' };
        const current = [...s.current];
        current[idx] = action.heroId;
        return { ...s, current };
      }

      case 'clear': {
        if (!playing || isLockedSlot(s, action.slot)) return s;
        const current = [...s.current];
        current[action.slot] = null;
        return { ...s, current };
      }

      case 'clearAll':
        if (!playing) return s;
        return { ...s, current: lockLifeline(emptyRow(), s.lifeline) };

      case 'move':
        return reduce(s, { type: 'swap', from: action.slot, to: action.slot + action.dir });

      case 'swap': {
        const { from, to } = action;
        if (!playing || to < 0 || to >= TEAM_SIZE || from === to) return s;
        if (isLockedSlot(s, from) || isLockedSlot(s, to)) return s;
        const current = [...s.current];
        [current[from], current[to]] = [current[to], current[from]];
        return { ...s, current };
      }

      case 'submit': {
        if (!playing) return s;
        const err = validateDraftRow(s, ctx);
        if (err) return { ...s, error: err };
        const guess = s.current as number[];
        const tiles = scoreDraft(guess, ctx.answer);
        const next: DraftState = { ...s, rows: [...s.rows, guess], scored: [...s.scored, tiles], submitSeq: s.submitSeq + 1 };
        if (isWinningDraftRow(tiles)) return { ...next, status: 'won', current: emptyRow() };
        if (next.rows.length >= MAX_ROWS) return { ...next, status: 'lost', current: emptyRow() };
        next.hintsRevealed = Math.max(next.hintsRevealed, autoDraftLevel(next.rows.length));
        next.current = nextRow(next, tiles);
        return withLifeline(next, ctx);
      }

      case 'revealHint': {
        if (!playing || s.hintsRevealed >= MAX_DRAFT_HINT_LEVEL) return s;
        const next = {
          ...s,
          hintsRevealed: Math.max(s.hintsRevealed, autoDraftLevel(s.rows.length)) + 1,
          earlyReveals: s.earlyReveals + 1,
        };
        return withLifeline(next, ctx);
      }
    }
  };
  return reduce;
}
