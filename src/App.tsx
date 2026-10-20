// App shell: loads data, picks the puzzle for the UTC date (F1), applies settings,
// and hosts the top bar, banners, dialogs and footer.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { track } from './analytics';
import { GAME_NAME } from './config';
import { GameScreen } from './components/GameScreen';
import { HowToPlay, SettingsDialog, StatsDialog } from './components/Dialogs';
import { Toast } from './components/Modal';
import { loadPuzzle, loadStatic, type StaticData } from './data/load';
import { addDays, clockOffsetFromHeader, puzzleDateAt } from './game/date';
import { displayStreak, loadActiveDate, loadGame, loadStats, storageAvailable } from './game/storage';
import type { Puzzle } from './game/types';
import type { ServerStats } from './discord/api';
import { isDiscordActivity, loadSession } from './discord/client';
import type { DiscordSession } from './discord/session';
import { saveGame } from './game/storage';
import { TopBar } from './components/TopBar';
import { useSettings } from './useSettings';

const IN_DISCORD = typeof window !== 'undefined' && isDiscordActivity();

/** Takes the server's copy when it's further along (e.g. started on another device). */
async function mergeServerGame(session: DiscordSession, date: string) {
  try {
    const mine = await session.api.getGame(date);
    const local = loadGame(date);
    if (mine && mine.rows.length > (local?.rows.length ?? 0)) {
      saveGame(date, {
        rows: mine.rows,
        hintsRevealed: mine.hintsRevealed,
        earlyReveals: mine.earlyReveals,
        lifeline: mine.lifeline,
        status: mine.status,
      });
    }
  } catch {
    /* offline or API asleep: keep the local copy */
  }
}

type Banner = { kind: 'late' | 'carryover' | 'storage' | 'discord'; text: string };

export default function App({ navigate }: { navigate?: (path: string) => void } = {}) {
  const [data, setData] = useState<StaticData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const { settings, setSettings, updateSettings, reducedMotion } = useSettings();
  const [dialog, setDialog] = useState<'help' | 'stats' | 'settings' | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(0);
  const [missing, setMissing] = useState(false);
  const [session, setSession] = useState<DiscordSession | null>(null);
  const [serverStats, setServerStats] = useState<ServerStats | null>(null);
  const [discordError, setDiscordError] = useState<string | null>(null);
  const refreshServerStats = useCallback(() => {
    session?.api.stats().then(setServerStats).catch(() => undefined);
  }, [session]);

  const now = useCallback(() => new Date(Date.now() + offset), [offset]);
  const today = useMemo(() => puzzleDateAt(now()), [now, tick]);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    window.clearTimeout((toast as unknown as { t?: number }).t);
    (toast as unknown as { t?: number }).t = window.setTimeout(() => setToastMsg(null), 1800);
  }, []);


  /** Chooses and loads the puzzle to show. */
  const choose = useCallback(
    async (d: StaticData, preferToday = false, s: DiscordSession | null = null) => {
      const nowDate = new Date(Date.now() + clockOffsetFromHeader(d.serverDate));
      const t = puzzleDateAt(nowDate);
      const next: Banner[] = storageAvailable() ? [] : [{ kind: 'storage', text: "Stats won't be saved in this browser." }];

      // F8: a puzzle started before the reset can still be finished; it counts for its own date.
      const active = loadActiveDate();
      if (!preferToday && active && active === addDays(t, -1) && loadGame(active)?.status === 'in_progress') {
        const p = await loadPuzzle(active);
        if (p && s) await mergeServerGame(s, p.date);
        if (p) {
          setPuzzle(p);
          setMissing(false);
          setBanners([...next, { kind: 'carryover', text: `Finish yesterday's puzzle #${p.puzzleNo} first. Today's is ready after.` }]);
          return;
        }
      }

      let p = await loadPuzzle(t);
      let late = false;
      if (!p) {
        // F1 fallback: most recent published puzzle + banner + error event.
        const latest = [...d.index.dates].filter((x) => x <= t).pop();
        p = latest ? await loadPuzzle(latest) : null;
        late = true;
        track('puzzle_missing', { date: t });
      }
      if (!p) {
        setError("Today's puzzle is running late and there's no earlier puzzle to show. Check back soon.");
        return;
      }
      if (s) await mergeServerGame(s, p.date);
      setPuzzle(p);
      setMissing(late);
      setBanners(late ? [...next, { kind: 'late', text: "Today's puzzle is running late. Here's the most recent one." }] : next);
    },
    [],
  );

  useEffect(() => {
    // Inside Discord, sign in first so progress from other devices can be merged before
    // the puzzle renders. A failed sign-in still lets the player play on this device.
    const signIn: Promise<DiscordSession | null> = IN_DISCORD
      ? loadSession().catch((e) => {
          console.warn('Discord sign-in failed', e);
          setDiscordError("Couldn't sign in with Discord. You can still play; your result won't show in this server.");
          return null;
        })
      : Promise.resolve(null);
    Promise.all([loadStatic(), signIn])
      .then(([d, s]) => {
        setOffset(clockOffsetFromHeader(d.serverDate));
        setData(d);
        setSession(s);
        return choose(d, false, s);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [choose]);

  useEffect(() => refreshServerStats(), [refreshServerStats]);

  // Re-evaluate the date every 30 s; pick up a late puzzle without a reload.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (data && missing && tick) choose(data, true, session);
  }, [tick, data, missing, choose, session]);

  // F9: tutorial on first visit only.
  useEffect(() => {
    if (data && !settings.seenTutorial) setDialog('help');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const playingDate = puzzle?.date ?? today;
  const newPuzzleReady = !!puzzle && playingDate < today && !missing;
  const playNew = () => {
    if (!data) return;
    setEndOpen(false);
    choose(data, true, session);
  };

  const stats = serverStats ?? loadStats();

  return (
    <div className="min-h-dvh">
      <TopBar
        mode="build"
        title={GAME_NAME}
        puzzleNo={puzzle?.puzzleNo}
        onHelp={() => setDialog('help')}
        onStats={() => setDialog('stats')}
        onSettings={() => setDialog('settings')}
        navigate={navigate}
      />

      {discordError && (
        <div role="status" className="border-b border-line bg-panel px-4 py-2 text-center text-small">
          {discordError}
        </div>
      )}
      {banners.map((b) => (
        <div key={b.kind} role="status" className="border-b border-line bg-panel px-4 py-2 text-center text-small">
          {b.kind === 'late' && <span aria-hidden="true" className="mr-2 inline-block h-2.5 w-2.5 bg-s-orange align-middle" />}
          {b.text}
        </div>
      ))}
      {newPuzzleReady && !endOpen && (
        <div role="status" className="flex items-center justify-center gap-3 border-b border-line bg-panel px-4 py-1.5 text-small">
          A new puzzle is ready.
          <button type="button" onClick={playNew} className="h-9 rounded-[3px] bg-ink px-3 font-bold text-bg">
            Play #{puzzle ? puzzle.puzzleNo + 1 : ''}
          </button>
        </div>
      )}

      {error ? (
        <p className="mx-auto max-w-md px-4 py-16 text-center text-small text-muted">{error}</p>
      ) : !data || !puzzle ? (
        <p className="py-24 text-center text-muted" aria-live="polite">
          {IN_DISCORD ? 'Connecting to Discord…' : "Loading today's puzzle…"}
        </p>
      ) : (
        <GameScreen
          key={puzzle.date}
          puzzle={puzzle}
          items={data.items}
          heroes={data.heroes}
          settings={settings}
          updateSettings={updateSettings}
          reducedMotion={reducedMotion}
          today={today}
          newPuzzleReady={newPuzzleReady}
          onPlayNew={playNew}
          now={now}
          toast={toast}
          endOpen={endOpen}
          setEndOpen={setEndOpen}
          session={session}
          serverStats={serverStats}
          onGameSynced={refreshServerStats}
        />
      )}

      {/* F12 footer / legal */}
      <footer className="mx-auto max-w-[1080px] px-4 pb-10 pt-6 text-label text-muted lg:px-6">
        Dota 2 is a registered trademark of Valve Corporation. This project is not affiliated with or endorsed by Valve. Match data from OpenDota.
      </footer>

      {dialog === 'help' && (
        <HowToPlay
          onClose={() => {
            setDialog(null);
            if (!settings.seenTutorial) updateSettings({ seenTutorial: true });
          }}
        />
      )}
      {dialog === 'stats' && (
        <StatsDialog stats={stats} streak={displayStreak(stats, today)} saved={!!serverStats || storageAvailable()} onClose={() => setDialog(null)} />
      )}
      {dialog === 'settings' && <SettingsDialog settings={settings} onChange={setSettings} onClose={() => setDialog(null)} />}
      <Toast message={toastMsg} />
    </div>
  );
}
