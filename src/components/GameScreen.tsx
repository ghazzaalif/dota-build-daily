// One puzzle's play screen: header, grid, actions, hints, picker, end screen.
import { useEffect, useMemo, useState } from 'react';
import { playedBucket, track } from '../analytics';
import { BUILD_SIZE, MAX_ROWS } from '../config';
import { answerKey, decodeAnswer } from '../game/answer';
import { solvedSlots, validateRow } from '../game/game';
import { unlockedLevel } from '../game/hints';
import { bestStates } from '../game/scoring';
import { buildShareText } from '../game/share';
import { displayStreak, loadStats, type Settings } from '../game/storage';
import type { HeroesMap, ItemsMap, Puzzle } from '../game/types';
import { useGame } from '../game/useGame';
import { EndScreen } from './EndScreen';
import { Grid } from './Grid';
import { HintsPanel } from './HintsPanel';
import { CloseIcon, ItemImage } from './Icons';
import { ItemPicker } from './ItemPicker';
import { PuzzleHeader } from './PuzzleHeader';
import { ServerBoard, useScoreboard } from './ServerBoard';
import { openExternal, setPresence } from '../discord/client';
import type { DiscordSession } from '../discord/session';
import type { ServerStats } from '../discord/api';

interface Props {
  puzzle: Puzzle;
  items: ItemsMap;
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
  /** Set when running as a Discord Activity and signed in. */
  session: DiscordSession | null;
  /** Stats from the player's Discord account (falls back to this browser's stats). */
  serverStats: ServerStats | null;
  onGameSynced: () => void;
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

export function GameScreen(p: Props) {
  const { puzzle, items, heroes, settings } = p;
  const answerEntries = useMemo(() => decodeAnswer(puzzle.answer, answerKey(puzzle.date, puzzle.puzzleNo)), [puzzle]);
  const answer = useMemo(() => answerEntries.map((a) => a.key), [answerEntries]);
  const { state, dispatch } = useGame(puzzle, answer, items, settings.keepGreens);
  const [selected, setSelected] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [animate, setAnimate] = useState(false);
  const desktop = useIsDesktop();

  const playing = state.status === 'in_progress';
  const finished = !playing;
  const level = unlockedLevel(state.rows.length, state.hintsRevealed, finished);
  const solved = solvedSlots(state.scored);
  const best = useMemo(() => bestStates(state.scored, items, answer), [state.scored, items, answer]);
  const rowFull = state.current.every(Boolean);
  const stats = p.serverStats ?? loadStats();
  const { session } = p;
  const [syncSeq, setSyncSeq] = useState(0);
  const board = useScoreboard(session, puzzle.date, syncSeq);

  // Discord: upload after every submitted row or hint so the server board and other
  // devices stay current. The server re-scores the rows itself.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    session.api
      .saveGame({
        date: puzzle.date,
        rows: state.rows,
        hintsRevealed: state.hintsRevealed,
        earlyReveals: state.earlyReveals,
        lifeline: state.lifeline,
        guildId: session.guildId,
        channelId: session.channelId,
      })
      .then(() => {
        if (cancelled) return;
        setSyncSeq((n) => n + 1);
        p.onGameSynced();
      })
      .catch(() => !cancelled && p.toast("Couldn't save to Discord. Your progress is kept on this device."));
    const result = state.status === 'won' ? `Solved in ${state.rows.length}/6` : state.status === 'lost' ? 'X/6' : `Guess ${state.rows.length + 1} of 6`;
    setPresence(session, `${puzzle.hero.name} (${puzzle.role.label})`, `#${puzzle.puzzleNo}: ${result}`);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, state.rows.length, state.hintsRevealed, state.earlyReveals, state.status]);

  useEffect(() => {
    track('puzzle_loaded', { mode: 'build', puzzle: puzzle.puzzleNo, played: playedBucket(stats.played) });
  }, [puzzle.puzzleNo]);

  // Open the end screen right away when returning to a finished puzzle.
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
    const valid = playing && validateRow(state) === null;
    dispatch({ type: 'submit' });
    if (valid) {
      setAnimate(true); // flip only the row just submitted
      setSheetOpen(false);
    }
  };

  // After the flip finishes, open the end screen if the game just ended.
  useEffect(() => {
    if (!animate || state.status === 'in_progress') return;
    const t = setTimeout(() => p.setEndOpen(true), p.reducedMotion ? 300 : BUILD_SIZE * 250 + 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, state.status]);

  const onSlotTap = (slot: number) => {
    if (!playing) return;
    if (state.lifeline?.slot === slot) return p.toast('This slot is locked by the lifeline');
    if (!state.current[slot]) {
      setSelected(null);
      if (!desktop) setSheetOpen(true);
      return;
    }
    // Tapping the selected slot again removes it; first tap selects it for reordering.
    if (selected === slot) {
      dispatch({ type: 'clear', slot });
      setSelected(null);
    } else setSelected(slot);
  };

  const backspace = () => {
    for (let i = BUILD_SIZE - 1; i >= 0; i--) {
      if (state.current[i] && state.lifeline?.slot !== i) return dispatch({ type: 'clear', slot: i });
    }
  };

  const share = async () => {
    const text = buildShareText({
      puzzleNo: puzzle.puzzleNo,
      heroName: puzzle.hero.name,
      roleLabel: puzzle.role.label,
      rows: state.scored.map((r) => r.map((t) => t.state)),
      won: state.status === 'won',
      hintsUsed: state.earlyReveals,
      colorblind: settings.colorblind,
    });
    track('share_clicked');
    if (session) {
      // Discord's own share dialog: posts the grid with a button that opens the Activity.
      try {
        const r = await session.sdk.commands.shareLink({ message: text });
        if (r.didSendMessage) p.toast('Shared!');
        else if (r.didCopyLink) p.toast('Link copied!');
        return;
      } catch {
        /* older clients: fall back to copying the text */
      }
    }
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

  const picker = (onClose?: () => void) => (
    <ItemPicker
      items={items}
      best={best}
      inRow={state.current}
      rowFull={rowFull}
      onAdd={(key) => {
        setSelected(null);
        dispatch({ type: 'add', key });
      }}
      onBackspace={backspace}
      onSubmit={submit}
      onClose={onClose}
      autoFocus={desktop}
    />
  );

  const hero = heroes[puzzle.hero.id];
  const primary = 'h-12 rounded-[3px] bg-ink font-bold text-bg transition-opacity duration-150 hover:opacity-90 disabled:bg-raised disabled:text-muted disabled:hover:opacity-100';
  const secondary = 'h-12 rounded-[3px] bg-raised font-semibold';

  return (
    <div className="mx-auto w-full max-w-[1080px] lg:grid lg:grid-cols-[minmax(0,600px)_minmax(0,1fr)] lg:gap-10 lg:px-6">
      <main className="px-4 pb-24 lg:px-0 lg:pb-10">
        <PuzzleHeader puzzle={puzzle} hero={hero} />

        <Grid
          state={state}
          items={items}
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
                Open shop
              </button>
            )}
            <button type="button" onClick={submit} disabled={!rowFull} className={`${primary} flex-1`}>
              Submit<span className="sr-only"> guess {state.rows.length + 1} of {MAX_ROWS}</span>
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => p.setEndOpen(true)} className={`${primary} mt-1 w-full`}>
            See his final items
          </button>
        )}

        <div className="mt-8">
          <HintsPanel
            puzzle={puzzle}
            heroes={heroes}
            items={items}
            level={level}
            solved={solved}
            lifeline={state.lifeline}
            playing={playing}
            confirmSeen={settings.hintConfirmSeen}
            onConfirmSeen={() => p.updateSettings({ hintConfirmSeen: true })}
            onReveal={() => dispatch({ type: 'revealHint' })}
          />
        </div>
        {board.enabled && session && <ServerBoard entries={board.entries} error={board.error} meId={session.user.id} />}
      </main>

      {/* Desktop: the shop is a side panel. */}
      {desktop && (
        <aside aria-label="Item shop" className="sticky top-[72px] mt-4 h-[calc(100dvh-88px)] self-start overflow-hidden rounded-[4px] bg-panel">
          {picker()}
        </aside>
      )}

      {/* Mobile: the shop is a bottom sheet with its own copy of the row being built. */}
      {!desktop && sheetOpen && playing && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/55" onClick={() => setSheetOpen(false)}>
          <div
            role="dialog"
            aria-label="Item shop"
            onClick={(e) => e.stopPropagation()}
            className="sheet-up flex h-[80dvh] flex-col rounded-t-[8px] border-t border-line bg-panel"
          >
            <div className="flex items-center gap-1.5 border-b border-line px-3 py-2.5">
              {state.current.map((k, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => k && state.lifeline?.slot !== i && dispatch({ type: 'clear', slot: i })}
                  aria-label={k ? `Slot ${i + 1}: ${items[k]?.name}. Tap to remove` : `Slot ${i + 1}: empty`}
                  className={`relative aspect-[11/8] min-h-[34px] flex-1 overflow-hidden rounded-[2px] border-2 ${k ? 'border-raised' : 'border-dashed border-faint'} bg-raised`}
                >
                  {k && <ItemImage item={items[k]} className="h-full w-full" />}
                  {k && state.lifeline?.slot !== i && (
                    <span className="absolute right-0 top-0 bg-black/70 p-[1px] text-white">
                      <CloseIcon className="h-2.5 w-2.5" />
                    </span>
                  )}
                </button>
              ))}
              <button
                type="button"
                onClick={submit}
                disabled={!rowFull}
                className={`${primary.replace('h-12', 'h-11')} ml-1 shrink-0 px-3 text-small`}
              >
                Submit
              </button>
            </div>
            {picker(() => setSheetOpen(false))}
          </div>
        </div>
      )}

      {p.endOpen && finished && (
        <EndScreen
          puzzle={puzzle}
          answer={answerEntries}
          items={items}
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
          onOpenLink={(url) => openExternal(session, url)}
          board={board.enabled && session ? <ServerBoard compact entries={board.entries} error={board.error} meId={session.user.id} /> : null}
        />
      )}
    </div>
  );
}
