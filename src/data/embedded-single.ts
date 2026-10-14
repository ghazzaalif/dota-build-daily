// Single-file preview build: items, heroes and the queued puzzles are bundled in.
// The preview is a private review build, so it includes the whole 7-day queue;
// the production site only ever receives puzzles with date ≤ tomorrow.
import items from '../../public/data/items.json';
import heroes from '../../public/data/heroes.json';
import type { HeroesMap, ItemsMap, Puzzle } from '../game/types';

const queued = import.meta.glob<{ puzzle: Puzzle }>('../../queue/20*.json', { eager: true, import: 'default' });
const published = import.meta.glob<Puzzle>('../../public/puzzles/20*.json', { eager: true, import: 'default' });

const puzzles: Record<string, Puzzle> = {};
for (const p of Object.values(published)) puzzles[p.date] = p;
for (const q of Object.values(queued)) puzzles[q.puzzle.date] = q.puzzle;

const embedded = { items: items as unknown as ItemsMap, heroes: heroes as unknown as HeroesMap, puzzles };
export default embedded;
