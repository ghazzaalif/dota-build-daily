// Draft PRD §5.3 hint schedule. The start info (board, side, first pick) is always shown.
// A hint is open once `afterRow` rows are in, or once the player reveals it early.
// POSITION_HINT_AT_ROW = 0 makes positions open from the start.
import { MAX_ROWS, POSITION_HINT_AT_ROW } from '../../config';

export type DraftHintId = 'positions' | 'teams' | 'players' | 'attributes' | 'lifeline';

export interface DraftHintDef {
  level: number;
  id: DraftHintId;
  title: string;
  afterRow: number;
}

export function buildHints(positionAtRow = POSITION_HINT_AT_ROW): DraftHintDef[] {
  const defs: Omit<DraftHintDef, 'level'>[] = [
    { id: 'positions', title: 'Positions', afterRow: positionAtRow },
    { id: 'teams', title: 'Teams & result', afterRow: 2 },
    { id: 'players', title: 'Players', afterRow: 3 },
    { id: 'attributes', title: 'Attributes', afterRow: 4 },
    { id: 'lifeline', title: 'Lifeline', afterRow: 5 },
  ];
  return [...defs].sort((a, b) => a.afterRow - b.afterRow).map((d, i) => ({ ...d, level: i + 1 }));
}

export const DRAFT_HINTS = buildHints();
export const MAX_DRAFT_HINT_LEVEL = DRAFT_HINTS.length;
export const LIFELINE_LEVEL = DRAFT_HINTS.find((h) => h.id === 'lifeline')!.level;

/** Hints unlocked by play alone after `rowsSubmitted` rows (row 6 ends the game, so it never counts). */
export function autoDraftLevel(rowsSubmitted: number, hints = DRAFT_HINTS): number {
  const rows = Math.min(rowsSubmitted, MAX_ROWS - 1);
  return hints.filter((h) => h.afterRow <= rows).length;
}

export function unlockedDraftLevel(rowsSubmitted: number, revealedLevel: number, finished: boolean): number {
  if (finished) return MAX_DRAFT_HINT_LEVEL;
  return Math.max(autoDraftLevel(rowsSubmitted), revealedLevel);
}

export const hintOpen = (id: DraftHintId, level: number) => (DRAFT_HINTS.find((h) => h.id === id)?.level ?? Infinity) <= level;
