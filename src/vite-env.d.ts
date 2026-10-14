/// <reference types="vite/client" />

declare module 'virtual:embedded-data' {
  import type { HeroesMap, ItemsMap, Puzzle } from './game/types';
  const embedded: { items: ItemsMap; heroes: HeroesMap; puzzles: Record<string, Puzzle> } | null;
  export default embedded;
}

interface Window {
  plausible?: (event: string, opts?: { props?: Record<string, string | number | boolean> }) => void;
  umami?: { track: (event: string, data?: Record<string, string | number | boolean>) => void };
}
