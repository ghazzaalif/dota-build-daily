// PRD §5.2 per-slot scoring and §5.3 shared-component rule. Pure functions.
import type { ItemsMap, ScoredTile, TileState } from './types';

/** The item plus its significant components (precomputed into items.json). */
function treeWithSelf(items: ItemsMap, key: string): string[] {
  return [key, ...(items[key]?.significantComponents ?? [])];
}

/**
 * Returns the significant component the guessed item shares with an answer item the
 * player hasn't found yet (the most expensive one when several match), or undefined.
 * Mjollnir vs Maelstrom → "maelstrom"; Desolator vs BKB → "mithril_hammer".
 *
 * `found` holds answer items already identified (🟩/🟨 in this row or an earlier one).
 * Pointing 🟧 at those would only repeat what the player knows, so they're skipped.
 */
export function sharedComponent(
  items: ItemsMap,
  guess: string,
  answer: readonly string[],
  found: ReadonlySet<string> = new Set(),
): string | undefined {
  const g = new Set(treeWithSelf(items, guess));
  let best: string | undefined;
  for (const a of answer) {
    if (a === guess || found.has(a)) continue;
    for (const c of treeWithSelf(items, a)) {
      if (!g.has(c)) continue;
      if (!best || (items[c]?.cost ?? 0) > (items[best]?.cost ?? 0)) best = c;
    }
  }
  return best;
}

export function sharesComponent(
  items: ItemsMap,
  guess: string,
  answer: readonly string[],
  found: ReadonlySet<string> = new Set(),
): boolean {
  return sharedComponent(items, guess, answer, found) !== undefined;
}

/** Answer items the player has identified in these rows (any 🟩 or 🟨). */
export function foundItems(rows: readonly (readonly string[])[], answer: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) for (const k of r) if (answer.includes(k)) out.add(k);
  return out;
}

/**
 * Scores one row. `previousRows` are the rows submitted before it: answer items found
 * there, or found elsewhere in this row, never produce 🟧.
 */
export function scoreRow(
  items: ItemsMap,
  guess: readonly string[],
  answer: readonly string[],
  previousRows: readonly (readonly string[])[] = [],
): ScoredTile[] {
  const found = foundItems([...previousRows, guess], answer);
  return guess.map((g, i) => {
    if (g === answer[i]) return { key: g, state: 'green' as const };
    if (answer.includes(g)) return { key: g, state: 'yellow' as const };
    const shared = sharedComponent(items, g, answer, found);
    if (shared) return { key: g, state: 'orange' as const, sharedComponent: shared };
    return { key: g, state: 'grey' as const };
  });
}

export const isWinningRow = (tiles: readonly ScoredTile[]) => tiles.every((t) => t.state === 'green');

const RANK: Record<TileState, number> = { green: 4, yellow: 3, orange: 2, grey: 1 };

/**
 * Best known state per item across all rows (picker shading, like Wordle's keyboard).
 * Pass `items` and `answer` to downgrade 🟧 to ⬛ once every answer item it pointed to has
 * been found, so the picker never keeps hinting at something already solved.
 */
export function bestStates(
  rows: readonly ScoredTile[][],
  items?: ItemsMap,
  answer?: readonly string[],
): Record<string, TileState> {
  const out: Record<string, TileState> = {};
  for (const row of rows) {
    for (const t of row) {
      const prev = out[t.key];
      if (!prev || RANK[t.state] > RANK[prev]) out[t.key] = t.state;
    }
  }
  if (items && answer) {
    const found = foundItems(
      rows.map((r) => r.map((t) => t.key)),
      answer,
    );
    for (const [k, s] of Object.entries(out)) {
      if (s === 'orange' && !sharesComponent(items, k, answer, found)) out[k] = 'grey';
    }
  }
  return out;
}
