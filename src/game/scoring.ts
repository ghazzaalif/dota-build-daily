// PRD §5.2 per-slot scoring and §5.3 shared-component rule. Pure functions.
import type { ItemsMap, ScoredTile, TileState } from './types';

/** The item plus its significant components (precomputed into items.json). */
function treeWithSelf(items: ItemsMap, key: string): string[] {
  return [key, ...(items[key]?.significantComponents ?? [])];
}

/**
 * Returns the significant component the guessed item shares with any answer item
 * (the most expensive one when several match), or undefined.
 * Mjollnir vs Maelstrom → "maelstrom"; Desolator vs BKB → "mithril_hammer".
 */
export function sharedComponent(items: ItemsMap, guess: string, answer: readonly string[]): string | undefined {
  const g = new Set(treeWithSelf(items, guess));
  let best: string | undefined;
  for (const a of answer) {
    if (a === guess) continue;
    for (const c of treeWithSelf(items, a)) {
      if (!g.has(c)) continue;
      if (!best || (items[c]?.cost ?? 0) > (items[best]?.cost ?? 0)) best = c;
    }
  }
  return best;
}

export function sharesComponent(items: ItemsMap, guess: string, answer: readonly string[]): boolean {
  return sharedComponent(items, guess, answer) !== undefined;
}

export function scoreRow(items: ItemsMap, guess: readonly string[], answer: readonly string[]): ScoredTile[] {
  return guess.map((g, i) => {
    if (g === answer[i]) return { key: g, state: 'green' as const };
    if (answer.includes(g)) return { key: g, state: 'yellow' as const };
    const shared = sharedComponent(items, g, answer);
    if (shared) return { key: g, state: 'orange' as const, sharedComponent: shared };
    return { key: g, state: 'grey' as const };
  });
}

export const isWinningRow = (tiles: readonly ScoredTile[]) => tiles.every((t) => t.state === 'green');

const RANK: Record<TileState, number> = { green: 4, yellow: 3, orange: 2, grey: 1 };

/** Best known state per item across all rows (picker shading, like Wordle's keyboard). */
export function bestStates(rows: readonly ScoredTile[][]): Record<string, TileState> {
  const out: Record<string, TileState> = {};
  for (const row of rows) {
    for (const t of row) {
      const prev = out[t.key];
      if (!prev || RANK[t.state] > RANK[prev]) out[t.key] = t.state;
    }
  }
  return out;
}
