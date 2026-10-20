// One Draft puzzle's play screen: header, board, grid, actions, hints, picker, end screen.
import { useEffect, useMemo, useState } from 'react';
import { track } from '../../analytics';
import { MAX_ROWS, TEAM_SIZE } from '../../config';
import { decodeSecret } from '../../game/answer';
import { draftSecretKey } from '../../game/draft/date';
import { solvedDraftSlots, unavailableHeroes, validateDraftRow } from '../../game/draft/game';
import { hintOpen, unlockedDraftLevel } from '../../game/draft/hints';
import { bestDraftStates } from '../../game/draft/scoring';
import { buildDraftShareText } from '../../game/draft/share';
import { loadDraftStats } from '../../game/draft/storage';
import type { DraftPuzzle, DraftSecret } from '../../game/draft/types';
import { useDraftGame } from '../../game/draft/useDraftGame';
import { displayStreak, loadGame, type Settings } from '../../game/storage';
import type { HeroesMap } from '../../game/types';
import { CloseIcon, HeroImage } from '../Icons';
import { DraftBoard } from './DraftBoard';
import { DraftEndScreen } from './DraftEndScreen';
import { DraftGrid } from './DraftGrid';
import { DraftHints } from './DraftHints';
import { HeroPicker } from './HeroPicker';

interface Props {
  puzzle: DraftPuzzle;
  heroes: HeroesMap;
  settings: Settings;
  updateSettings: (p: Partial<Settings>) => void;
  reducedMotion: boolean;
  today: string;
  newPuzzleReady: boolean;
  onPlayNew: () => void;
  now: () => Date;
  toast: (m: string) => void;
  endOpen: boolean;
  setEndOpen: (v: boolean) => void;
  navigate?: (path: string) => void;
}

function useIsDesktop() {
  const q = '(min-width: 1024px)';
  const [d, setD] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setD(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return d;
}

export function DraftScreen(p: Props) {
  const { puzzle, heroes, settings } = p;
  const secret = useMemo(() => decodeSecret<DraftSecret>(puzzle.secret, draftSecretKey(puzzle.date, puzzle.puzzleNo)), [puzzle]);
  const ctx = useMemo(() => ({ answer: secret.answer, unavailable: unavailableHeroes(puzzle) }), [secret, puzzle]);
  const blocked = useMemo(() => {
    const m = new Map<number, 'Banned' | 'Enemy pick'>();
    for (const e of puzzle.draft) if (e.heroId !== undefined) m.set(e.heroId, e.type === 'ban' ? 'Banned' : 'Enemy pick');
    return m;
  }, [puzzle]);
  const { state, dispatch } = useDraftGame(puzzle, ctx, settings.keepGreens);
  const [selected, setSelected] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [animate, setAnimate] = useState(false);
  const desktop = useIsDesktop();

  const playing = state.status === 'in_progress';
  const finished = !playing;
  const level = unlockedDraftLevel(state.rows.length, state.hintsRevealed, finished);
  const solved = solvedDraftSlots(state.scored);
  const best = useMemo(() => bestDraftStates(state.scored), [state.scored]);
  const rowFull = state.current.every((h) => h !== null);
  const stats = loadDraftStats();
  const show = { positions: hintOpen('positions', level), players: hintOpen('players', level), attributes: hintOpen('attributes', level) };
  const known = solved.map((s, i) => (s || finished || state.lifeline?.slot === i ? secret.answer[i] : null));

  useEffect(() => {
    track('puzzle_loaded', { mode: 'draft', puzzle: puzzle.puzzleNo });
  }, [puzzle.puzzleNo]);

  useEffect(() => {
    if (finished && !animate) p.setEndOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.error) p.toast(state.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.error, state.submitSeq]);

  const submit = () => {
    setSelected(null);
    const valid = playing && validateDraftRow(state, ctx) === null;
    dispatch({ type: 'submit' });
    if (valid) {
      setAnimate(true);
      setSheetOpen(false);
    }
  };

  useEffect(() => {
    if (!animate || state.status === 'in_progress') return;
    const t = setTimeout(() => p.setEndOpen(true), p.reducedMotion ? 300 : TEAM_SIZE * 250 + 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, state.status]);

  const onSlotTap = (slot: number) => {
    if (!playing) return;
    if (state.lifeline?.slot === slot) return p.toast('This pick is locked by the lifeline');
    if (state.current[slot] === null) {
      setSelected(null);
      if (!desktop) setSheetOpen(true);
      return;
    }
    if (selected === slot) {
      dispatch({ type: 'clear', slot });
      setSelected(null);
    } else setSelected(slot);
  };

  const backspace = () => {
    for (let i = TEAM_SIZE - 1; i >= 0; i--) {
      if (state.current[i] !== null && state.lifeline?.slot !== i) return dispatch({ type: 'clear', slot: i });
    }
  };

  const share = async () => {
    const text = buildDraftShareText({
      puzzleNo: puzzle.puzzleNo,
      tournament: puzzle.tournament.name,
      stage: puzzle.tournament.stage,
      rows: state.scored.map((r) => r.map((t) => t.state)),
      won: state.status === 'won',
      hintsUsed: state.earlyReveals,
      colorblind: settings.colorblind,
    });
    track('share_clicked', { mode: 'draft' });
    const touch = window.matchMedia('(pointer: coarse)').matches;
    if (touch && navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        /* cancelled — fall back to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    p.toast('Copied!');
  };

  const picker = (columns: number, onClose?: () => void) => (
    <HeroPicker
      heroes={heroes}
      best={best}
      blocked={blocked}
      inRow={state.current}
      rowFull={rowFull}
      columns={columns}
      onAdd={(heroId) => {
        setSelected(null);
        dispatch({ type: 'add', heroId });
      }}
      onBackspace={backspace}
      onSubmit={submit}
      onClose={onClose}
      autoFocus={desktop}
    />
  );

  const primary = 'h-12 rounded-[3px] bg-ink font-bold text-bg transition-opacity duration-150 hover:opacity-90 disabled:bg-raised disabled:text-muted disabled:hover:opacity-100';
  const secondary = 'h-12 rounded-[3px] bg-raised font-semibold';
  const buildDone = ['won', 'lost'].includes(loadGame(p.today)?.status ?? '');

  return (
    <div className="mx-auto w-full max-w-[1080px] lg:grid lg:grid-cols-[minmax(0,600px)_minmax(0,1fr)] lg:gap-10 lg:px-6">
      <main className="px-4 pb-24 lg:px-0 lg:pb-10">
        <header className="pb-4 pt-4">
          <div className="chyron-cut bg-ink py-2 pl-4 pr-9 text-bg sm:pl-5">
            <h1 className="font-display text-hero font-extrabold uppercase [text-wrap:balance] sm:text-heroLg">Guess the draft</h1>
            <p className="mt-1 text-small font-semibold">
              {puzzle.hiddenSide === 'radiant' ? 'Radiant' : 'Dire'} · {puzzle.hiddenHadFirstPick ? 'First pick' : 'Second pick'}
            </p>
          </div>
          <dl className="mt-px flex flex-wrap gap-px text-label">
            <div className="flex items-center bg-panel px-3 py-1.5">
              <dt className="sr-only">Tournament</dt>
              <dd className="font-semibold">{puzzle.tournament.name}</dd>
            </div>
            <div className="flex items-center bg-panel px-3 py-1.5">
              <dt className="sr-only">Stage</dt>
              <dd>{puzzle.tournament.stage}</dd>
            </div>
            <div className="flex flex-1 items-center bg-panel px-3 py-1.5 text-muted">
              <dt className="sr-only">Patch</dt>
              <dd>Patch {puzzle.patch}</dd>
            </div>
          </dl>
        </header>

        <div className="mb-6">
          <DraftBoard puzzle={puzzle} heroes={heroes} known={known} showPositions={show.positions} showTeams={hintOpen('teams', level)} />
        </div>

        <DraftGrid
          state={state}
          puzzle={puzzle}
          heroes={heroes}
          show={show}
          solved={solved}
          animateLastRow={animate && !p.reducedMotion}
          onSlotTap={onSlotTap}
          onSwap={(from, to) => dispatch({ type: 'swap', from, to })}
          onMove={(slot, dir) => {
            dispatch({ type: 'move', slot, dir });
            setSelected(slot + dir);
          }}
          onClear={(slot) => dispatch({ type: 'clear', slot })}
          selected={selected}
          setSelected={setSelected}
        />

        {playing ? (
          <div className="mt-1 flex gap-2">
            <button type="button" onClick={() => dispatch({ type: 'clearAll' })} className="h-12 px-3 font-semibold text-muted hover:text-ink">
              Clear row
            </button>
            {!desktop && (
              <button type="button" onClick={() => setSheetOpen(true)} className={`${secondary} flex-1`}>
                Pick heroes
              </button>
            )}
            <button type="button" onClick={submit} disabled={!rowFull} className={`${primary} flex-1`}>
              Submit<span className="sr-only"> guess {state.rows.length + 1} of {MAX_ROWS}</span>
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => p.setEndOpen(true)} className={`${primary} mt-1 w-full`}>
            See the full draft
          </button>
        )}

        <div className="mt-8">
          <DraftHints
            puzzle={puzzle}
            heroes={heroes}
            level={level}
            solved={solved}
            lifeline={state.lifeline}
            playing={playing}
            confirmSeen={settings.hintConfirmSeen}
            onConfirmSeen={() => p.updateSettings({ hintConfirmSeen: true })}
            onReveal={() => dispatch({ type: 'revealHint' })}
          />
        </div>
      </main>

      {desktop && (
        <aside aria-label="Hero picker" className="sticky top-[116px] mt-4 h-[calc(100dvh-132px)] self-start overflow-hidden rounded-[4px] bg-panel">
          {picker(3)}
        </aside>
      )}

      {!desktop && sheetOpen && playing && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/55" onClick={() => setSheetOpen(false)}>
          <div
            role="dialog"
            aria-label="Hero picker"
            onClick={(e) => e.stopPropagation()}
            className="sheet-up flex h-[85dvh] flex-col rounded-t-[8px] border-t border-line bg-panel"
          >
            <div className="flex items-center gap-1.5 border-b border-line px-3 py-2.5">
              {state.current.map((id, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => id !== null && state.lifeline?.slot !== i && dispatch({ type: 'clear', slot: i })}
                  aria-label={id !== null ? `Pick ${i + 1}: ${heroes[id]?.name}. Tap to remove` : `Pick ${i + 1}: empty`}
                  className={`relative aspect-[16/9] min-h-[34px] flex-1 overflow-hidden rounded-[2px] border-2 ${id !== null ? 'border-raised' : 'border-dashed border-faint'} bg-raised`}
                >
                  {id !== null && <HeroImage hero={heroes[id]} className="h-full w-full" />}
                  {id !== null && state.lifeline?.slot !== i && (
                    <span className="absolute right-0 top-0 bg-black/70 p-[1px] text-white">
                      <CloseIcon className="h-2.5 w-2.5" />
                    </span>
                  )}
                </button>
              ))}
              <button type="button" onClick={submit} disabled={!rowFull} className={`${primary.replace('h-12', 'h-11')} ml-1 shrink-0 px-3 text-small`}>
                Submit
              </button>
            </div>
            {picker(4, () => setSheetOpen(false))}
          </div>
        </div>
      )}

      {p.endOpen && finished && (
        <DraftEndScreen
          puzzle={puzzle}
          secret={secret}
          heroes={heroes}
          won={state.status === 'won'}
          rowsUsed={state.rows.length}
          hintsUsed={state.earlyReveals}
          stats={stats}
          streak={displayStreak(stats, p.today)}
          now={p.now}
          onShare={share}
          onClose={() => p.setEndOpen(false)}
          newPuzzleReady={p.newPuzzleReady}
          onPlayNew={p.onPlayNew}
          buildDone={buildDone}
          onGoBuild={p.navigate ? () => p.navigate!('/') : undefined}
        />
      )}
    </div>
  );
}
