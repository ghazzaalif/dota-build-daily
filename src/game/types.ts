// Shared data shapes (PRD §9).

export type Category =
  | 'boots'
  | 'accessories'
  | 'support'
  | 'magical'
  | 'armor'
  | 'weapons'
  | 'artifacts';

export interface ItemInfo {
  id: number;
  name: string;
  cost: number;
  category: Category;
  img: string;
  aliases: string[];
  components: string[];
  significantComponents: string[];
  eligible: boolean;
}

export type ItemsMap = Record<string, ItemInfo>;

export type HeroAttr = 'str' | 'agi' | 'int' | 'all';

export interface HeroInfo {
  id: number;
  key: string;
  name: string;
  img: string;
  /** Draft mode only (PRD Draft §9.2); optional so older heroes.json files still load. */
  attr?: HeroAttr;
  attackType?: 'melee' | 'ranged';
  /** Most common pro position on the current patch (picker grouping only, never scoring). */
  typicalPos?: 1 | 2 | 3 | 4 | 5;
  aliases?: string[];
}

export type HeroesMap = Record<string, HeroInfo>;

export type RoleLabel = 'Carry' | 'Mid' | 'Offlane' | 'Soft Support' | 'Hard Support';

export interface AnswerEntry {
  key: string;
  timeSec: number;
}

export interface Puzzle {
  puzzleNo: number;
  date: string;
  patch: string;
  hero: { id: number; key: string; name: string };
  role: { pos: 1 | 2 | 3 | 4 | 5; label: RoleLabel };
  tournament: { leagueId: number; name: string; stage: string };
  hints: {
    allies: number[];
    enemies: number[];
    result: 'win' | 'loss';
    durationSec: number;
    player: { name: string; team: string };
    priceBands: string[];
  };
  match: { matchId: number; radiantTeam: string; direTeam: string; playerSide: 'radiant' | 'dire' };
  /** Obfuscated AnswerEntry[] (see answer.ts). */
  answer: string;
}

export interface PuzzleIndex {
  /** Published puzzle dates (YYYY-MM-DD), ascending. */
  dates: string[];
}

export type TileState = 'green' | 'yellow' | 'orange' | 'grey';

export interface ScoredTile {
  key: string;
  state: TileState;
  /** For orange tiles: the shared significant component's item key. */
  sharedComponent?: string;
}
