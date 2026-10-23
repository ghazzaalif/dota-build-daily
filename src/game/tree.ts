// Item recipe trees, for the "item tree" panel: what an item is made from, what it builds
// into, and — for a 🟧 tile — which answer candidates share its component. Pure functions;
// everything here is public recipe data plus what the player's own rows already showed.
import type { ItemsMap, ScoredTile } from './types';

export interface ComponentCount {
  key: string;
  count: number;
}

/** Direct components with counts (Battle Fury → Perseverance, Broadsword ×2, Quelling Blade). */
export function madeFrom(items: ItemsMap, key: string): ComponentCount[] {
  const out: ComponentCount[] = [];
  for (const c of items[key]?.components ?? []) {
    if (!items[c]) continue;
    const hit = out.find((o) => o.key === c);
    if (hit) hit.count++;
    else out.push({ key: c, count: 1 });
  }
  return out;
}

const byCost = (items: ItemsMap) => (a: string, b: string) =>
  (items[a].cost - items[b].cost) || items[a].name.localeCompare(items[b].name);

/** Eligible (guessable) items whose recipe uses `key` directly. */
export function buildsInto(items: ItemsMap, key: string): string[] {
  return Object.keys(items)
    .filter((k) => k !== key && items[k].eligible && items[k].components.includes(key))
    .sort(byCost(items));
}

/**
 * Every guessable item that shares `component` the way 🟧 means it: the component itself
 * (if guessable) or any item with it among its significant components. These are the
 * items a 🟧 tile could be pointing at.
 */
export function itemsSharing(items: ItemsMap, component: string): string[] {
  return Object.keys(items)
    .filter((k) => items[k].eligible && (k === component || items[k].significantComponents.includes(component)))
    .sort(byCost(items));
}

export type CandidateStatus = 'open' | 'ruled_out' | 'found';

/**
 * Splits 🟧 candidates by what the rows proved: an item guessed and never 🟩/🟨 is not in the
 * build ('ruled_out'). One that was 🟩/🟨 is 'found': since 🟧 never points at items already
 * found when the row was scored, a found candidate was found later and is the likely answer.
 */
export function orangeCandidates(
  items: ItemsMap,
  tile: ScoredTile,
  scored: readonly ScoredTile[][],
): { key: string; status: CandidateStatus }[] {
  if (tile.state !== 'orange' || !tile.sharedComponent) return [];
  const states = new Map<string, Set<string>>();
  for (const row of scored) for (const t of row) (states.get(t.key) ?? states.set(t.key, new Set()).get(t.key)!).add(t.state);
  return itemsSharing(items, tile.sharedComponent)
    .filter((k) => k !== tile.key)
    .map((k) => {
      const s = states.get(k);
      const status: CandidateStatus = !s ? 'open' : s.has('green') || s.has('yellow') ? 'found' : 'ruled_out';
      return { key: k, status };
    });
}
