// PRD §5.4 hint schedule. Level 0 (hero, role, tournament, patch) is always visible.
import { MAX_ROWS, PRICE_BAND_EDGES } from '../config';

export type HintId = 'draft' | 'result' | 'player' | 'prices' | 'lifeline';

export interface HintDef {
  level: number;
  id: HintId;
  title: string;
  /** The row count after which this hint unlocks by itself. */
  afterRow: number;
}

export const HINTS: HintDef[] = [
  { level: 1, id: 'draft', title: 'Draft', afterRow: 1 },
  { level: 2, id: 'result', title: 'Result & duration', afterRow: 2 },
  { level: 3, id: 'player', title: 'Player & team', afterRow: 3 },
  { level: 4, id: 'prices', title: 'Price band per slot', afterRow: 4 },
  { level: 5, id: 'lifeline', title: 'Lifeline', afterRow: 5 },
];

export const MAX_HINT_LEVEL = HINTS.length;

/** Hints unlocked by play alone after `rowsSubmitted` rows. */
export const autoLevel = (rowsSubmitted: number) => Math.min(rowsSubmitted, MAX_HINT_LEVEL, MAX_ROWS - 1);

export function unlockedLevel(rowsSubmitted: number, revealedLevel: number, finished: boolean): number {
  if (finished) return MAX_HINT_LEVEL;
  return Math.max(autoLevel(rowsSubmitted), revealedLevel);
}

/** Price band label for an item cost, e.g. 4050 → "3500-4500". */
export function priceBand(cost: number, edges = PRICE_BAND_EDGES): string {
  let lo = 0;
  for (const e of edges) {
    if (cost < e) return `${lo}-${e}`;
    lo = e;
  }
  return `${lo}+`;
}

/** "3500-4500" → "3,500–4,500 gold"; "0-2000" → "Under 2,000 gold". */
export function formatBand(band: string): string {
  const fmt = (n: string) => Number(n).toLocaleString('en-US');
  if (band.endsWith('+')) return `${fmt(band.slice(0, -1))}+ gold`;
  const [lo, hi] = band.split('-');
  if (lo === '0') return `Under ${fmt(hi)} gold`;
  return `${fmt(lo)}–${fmt(hi)} gold`;
}

/** Earliest slot that has never been 🟩 in a submitted row (the lifeline target). */
export function earliestUnsolvedSlot(solved: readonly boolean[]): number {
  const i = solved.findIndex((s) => !s);
  return i === -1 ? 0 : i;
}
