// Draft PRD §5.2 per-slot scoring. Pure functions.
import type { DraftTile, DraftTileState } from './types';

/** 🟩 right hero, right slot · 🟨 in the hidden team, wrong slot · ⬛ not in the team. */
export function scoreDraft(guess: readonly number[], answer: readonly number[]): DraftTile[] {
  return guess.map((g, i) => {
    if (g === answer[i]) return { heroId: g, state: 'green' as const };
    if (answer.includes(g)) return { heroId: g, state: 'yellow' as const };
    return { heroId: g, state: 'grey' as const };
  });
}

export const isWinningDraftRow = (tiles: readonly DraftTile[]) => tiles.length > 0 && tiles.every((t) => t.state === 'green');

const RANK: Record<DraftTileState, number> = { green: 3, yellow: 2, grey: 1 };

/** Best known state per hero across all rows (picker shading, like Wordle's keyboard). */
export function bestDraftStates(rows: readonly DraftTile[][]): Record<number, DraftTileState> {
  const out: Record<number, DraftTileState> = {};
  for (const row of rows) {
    for (const t of row) {
      const prev = out[t.heroId];
      if (!prev || RANK[t.state] > RANK[prev]) out[t.heroId] = t.state;
    }
  }
  return out;
}
