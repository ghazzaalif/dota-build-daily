// React wrapper around the Draft reducer: persistence, stats and analytics (mode: "draft").
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { track } from '../../analytics';
import { recordResult } from '../storage';
import { draftReducer, initDraftGame, toDraftSaved, type DraftAction, type DraftContext, type DraftState } from './game';
import { loadDraftGame, loadDraftStats, saveDraftActiveDate, saveDraftGame, saveDraftStats } from './storage';
import type { DraftPuzzle } from './types';

export function useDraftGame(puzzle: DraftPuzzle, ctx: DraftContext, keepGreens: boolean) {
  const reducer = useMemo(() => draftReducer(ctx), [ctx]);
  const [state, dispatch] = useReducer(reducer, null, () => initDraftGame(ctx, loadDraftGame(puzzle.date), keepGreens));
  const prev = useRef<DraftState>(state);

  useEffect(() => dispatch({ type: 'setKeepGreens', value: keepGreens }), [keepGreens]);

  useEffect(() => {
    saveDraftGame(puzzle.date, toDraftSaved(state));
    saveDraftActiveDate(puzzle.date);
    const before = prev.current;
    if (state.rows.length > before.rows.length) track('guess_submitted', { mode: 'draft', row: state.rows.length });
    if (state.hintsRevealed > before.hintsRevealed) {
      track('hint_revealed', { mode: 'draft', hint: state.hintsRevealed, early: state.earlyReveals > before.earlyReveals });
    }
    if (before.status === 'in_progress' && state.status !== 'in_progress') {
      const won = state.status === 'won';
      saveDraftStats(recordResult(loadDraftStats(), puzzle.date, won, state.rows.length));
      track('puzzle_completed', { mode: 'draft', win: won, rows: state.rows.length, hints: state.earlyReveals });
    }
    prev.current = state;
  }, [state, puzzle.date]);

  return { state, dispatch: dispatch as (a: DraftAction) => void };
}
