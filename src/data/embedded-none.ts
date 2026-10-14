// Normal build: nothing embedded, data is fetched at runtime.
import type { HeroesMap, ItemsMap, Puzzle } from '../game/types';

const embedded: { items: ItemsMap; heroes: HeroesMap; puzzles: Record<string, Puzzle> } | null = null;
export default embedded;
