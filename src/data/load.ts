// Data loading. The SPA fetches static JSON (PRD §9); the single-file preview
// build embeds the same files instead (see vite.config.ts).
import embedded from 'virtual:embedded-data';
import type { HeroesMap, ItemsMap, Puzzle, PuzzleIndex } from '../game/types';

const base = import.meta.env.BASE_URL;

async function getJson<T>(path: string): Promise<{ data: T | null; date: string | null }> {
  try {
    const res = await fetch(`${base}${path}`, { cache: 'no-store' });
    if (!res.ok) return { data: null, date: res.headers.get('date') };
    return { data: (await res.json()) as T, date: res.headers.get('date') };
  } catch {
    return { data: null, date: null };
  }
}

export interface StaticData {
  items: ItemsMap;
  heroes: HeroesMap;
  index: PuzzleIndex;
  /** Server Date header (for clock-skew correction), if available. */
  serverDate: string | null;
}

export async function loadStatic(): Promise<StaticData> {
  if (embedded) {
    return { items: embedded.items, heroes: embedded.heroes, index: { dates: Object.keys(embedded.puzzles).sort() }, serverDate: null };
  }
  const [items, heroes, index] = await Promise.all([
    getJson<ItemsMap>('data/items.json'),
    getJson<HeroesMap>('data/heroes.json'),
    getJson<PuzzleIndex>('puzzles/index.json'),
  ]);
  if (!items.data || !heroes.data) throw new Error('Game data failed to load');
  return { items: items.data, heroes: heroes.data, index: index.data ?? { dates: [] }, serverDate: index.date };
}

export async function loadPuzzle(date: string): Promise<Puzzle | null> {
  if (embedded) return embedded.puzzles[date] ?? null;
  return (await getJson<Puzzle>(`puzzles/${date}.json`)).data;
}
