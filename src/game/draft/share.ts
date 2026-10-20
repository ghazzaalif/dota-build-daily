// Draft F7 share text. Never contains hero, team or player names (tournament and stage
// are fine: they're visible from the start).
import { DRAFT_GAME_NAME, DRAFT_PATH, MAX_ROWS, SITE_URL } from '../../config';
import type { DraftTileState } from './types';

const EMOJI: Record<DraftTileState, string> = { green: '🟩', yellow: '🟨', grey: '⬛' };
const EMOJI_CB: Record<DraftTileState, string> = { green: '🟦', yellow: '🟧', grey: '⬛' };

/** "The International 2026" → "TI 2026"; anything else is kept as is. */
export function shortTournament(name: string): string {
  const ti = /^The International (\d{4})$/i.exec(name.trim());
  return ti ? `TI ${ti[1]}` : name.trim();
}

/** "Grand Final, game 5" → "Grand Final" (the game number is a mild spoiler of nothing, but it's noise). */
export function shortStage(stage: string): string {
  return stage.replace(/,\s*game \d+$/i, '').trim();
}

export interface DraftShareInput {
  puzzleNo: number;
  tournament: string;
  stage: string;
  rows: DraftTileState[][];
  won: boolean;
  hintsUsed: number;
  colorblind?: boolean;
  url?: string;
}

export function buildDraftShareText(s: DraftShareInput): string {
  const map = s.colorblind ? EMOJI_CB : EMOJI;
  const score = s.won ? `${s.rows.length}/${MAX_ROWS}` : `X/${MAX_ROWS}`;
  return [
    `${DRAFT_GAME_NAME} #${s.puzzleNo} — ${shortTournament(s.tournament)} · ${shortStage(s.stage)}`,
    `${score} 💡${s.hintsUsed}`,
    ...s.rows.map((r) => r.map((t) => map[t]).join('')),
    s.url ?? `${SITE_URL}${DRAFT_PATH}`,
  ].join('\n');
}
