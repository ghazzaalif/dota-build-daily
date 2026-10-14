// F7 share text. Must not contain item names (no spoilers).
import { GAME_NAME, MAX_ROWS, SITE_URL } from '../config';
import type { TileState } from './types';

const EMOJI: Record<TileState, string> = { green: '🟩', yellow: '🟨', orange: '🟧', grey: '⬛' };
const EMOJI_CB: Record<TileState, string> = { green: '🟦', yellow: '🟧', orange: '🟪', grey: '⬛' };

export interface ShareInput {
  puzzleNo: number;
  heroName: string;
  roleLabel: string;
  rows: TileState[][];
  won: boolean;
  hintsUsed: number;
  colorblind?: boolean;
  url?: string;
}

export function buildShareText(s: ShareInput): string {
  const map = s.colorblind ? EMOJI_CB : EMOJI;
  const score = s.won ? `${s.rows.length}/${MAX_ROWS}` : `X/${MAX_ROWS}`;
  return [
    `${GAME_NAME} #${s.puzzleNo} — ${s.heroName} (${s.roleLabel})`,
    `${score} 💡${s.hintsUsed}`,
    ...s.rows.map((r) => r.map((t) => map[t]).join('')),
    s.url ?? SITE_URL,
  ].join('\n');
}

export const TILE_EMOJI = EMOJI;
export const TILE_EMOJI_CB = EMOJI_CB;
