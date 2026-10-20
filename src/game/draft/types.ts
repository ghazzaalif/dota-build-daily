// Draft Daily data shapes (requirements/dota-draft-daily-prd.md §9).
import type { HeroAttr } from '../types';

export type Pos = 1 | 2 | 3 | 4 | 5;

/** §5.2: three tile states only. No 🟧 in Draft mode (decision D3). */
export type DraftTileState = 'green' | 'yellow' | 'grey';

export interface DraftTile {
  heroId: number;
  state: DraftTileState;
}

/**
 * One Captain's Mode entry, in recorded order. Hidden-team picks carry `slot` (1–5)
 * and never a `heroId`, so the answer isn't readable from the public file.
 */
export interface DraftEntry {
  order: number;
  type: 'ban' | 'pick';
  team: 'hidden' | 'enemy';
  heroId?: number;
  slot?: number;
}

export interface DraftPuzzle {
  mode: 'draft';
  puzzleNo: number;
  date: string;
  patch: string;
  tournament: { leagueId: number; name: string; stage: string };
  hiddenSide: 'radiant' | 'dire';
  hiddenHadFirstPick: boolean;
  draft: DraftEntry[];
  hints: {
    /** Position played by each slot, in slot order. */
    positions: Pos[];
    teams: { hidden: string; enemy: string };
    result: 'win' | 'loss';
    durationSec: number;
    players: string[];
    attributes: HeroAttr[];
  };
  /** Obfuscated DraftSecret (see answer.ts encodeSecret). */
  secret: string;
}

/** What `secret` decodes to. The match ID lives here because it reveals the answer. */
export interface DraftSecret {
  answer: number[];
  match: { matchId: number; radiantTeam: string; direTeam: string };
}

export const POS_LABEL: Record<Pos, string> = {
  1: 'Carry',
  2: 'Mid',
  3: 'Offlane',
  4: 'Soft Support',
  5: 'Hard Support',
};

export const POS_SHORT: Record<Pos, string> = { 1: 'Carry', 2: 'Mid', 3: 'Off', 4: 'Pos 4', 5: 'Pos 5' };

export const ATTR_LABEL: Record<HeroAttr, string> = {
  str: 'Strength',
  agi: 'Agility',
  int: 'Intelligence',
  all: 'Universal',
};
