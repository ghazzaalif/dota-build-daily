// React wrapper around the pure reducer: persistence, stats and analytics.
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { track } from '../analytics';
import { gameReducer, initGame, toSaved, type GameAction, type GameState } from './game';
import { loadGame, loadStats, recordResult, saveActiveDate, saveGame, saveStats } from './storage';
import type { ItemsMap, Puzzle } from './types';

export function useGame(puzzle: Puzzle, answer: string[], items: ItemsMap, keepGreens: boolean) {
  const ctx = useMemo(() => ({ answer, items }), [answer, items]);
  const reducer = useMemo(() => gameReducer(ctx), [ctx]);
  const [state, rawDispatch] = useReducer(reducer, null, () => initGame(ctx, loadGame(puzzle.date), keepGreens));
  const prev = useRef<GameState>(state);

  useEffect(() => rawDispatch({ type: 'setKeepGreens', value: keepGreens }), [keepGreens]);

  useEffect(() => {
    saveGame(puzzle.date, toSaved(state));
    saveActiveDate(puzzle.date);
    const before = prev.current;
    if (state.rows.length > before.rows.length) {
      track('guess_submitted', { row: state.rows.length });
    }
    if (state.hintsRevealed > before.hintsRevealed) {
      track('hint_revealed', { hint: state.hintsRevealed, early: state.earlyReveals > before.earlyReveals });
    }
    if (before.status === 'in_progress' && state.status !== 'in_progress') {
      const won = state.status === 'won';
      saveStats(recordResult(loadStats(), puzzle.date, won, state.rows.length));
      track('puzzle_completed', { win: won, rows: state.rows.length, hints: state.earlyReveals });
    }
    prev.current = state;
  }, [state, puzzle.date]);

  const dispatch = (a: GameAction) => rawDispatch(a);
  return { state, dispatch };
}
