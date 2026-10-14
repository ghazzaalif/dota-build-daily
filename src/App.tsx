// App shell: loads data, picks the puzzle for the UTC date (F1), applies settings,
// and hosts the top bar, banners, dialogs and footer.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { track } from './analytics';
import { GAME_NAME } from './config';
import { GameScreen } from './components/GameScreen';
import { HowToPlay, SettingsDialog, StatsDialog } from './components/Dialogs';
import { GearIcon, HelpIcon, StatsIcon } from './components/Icons';
import { Toast } from './components/Modal';
import { loadPuzzle, loadStatic, type StaticData } from './data/load';
import { addDays, clockOffsetFromHeader, puzzleDateAt } from './game/date';
import { displayStreak, loadActiveDate, loadGame, loadSettings, loadStats, saveSettings, storageAvailable, type Settings } from './game/storage';
import type { Puzzle } from './game/types';

type Banner = { kind: 'late' | 'carryover' | 'storage'; text: string };

export default function App() {
  const [data, setData] = useState<StaticData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [dialog, setDialog] = useState<'help' | 'stats' | 'settings' | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(0);
  const [missing, setMissing] = useState(false);

  const now = useCallback(() => new Date(Date.now() + offset), [offset]);
  const today = useMemo(() => puzzleDateAt(now()), [now, tick]);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    window.clearTimeout((toast as unknown as { t?: number }).t);
    (toast as unknown as { t?: number }).t = window.setTimeout(() => setToastMsg(null), 1800);
  }, []);

  // Settings → document attributes (theme, colorblind palette, motion).
  const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reducedMotion = settings.reducedMotion === 'on' || (settings.reducedMotion === 'system' && prefersReduced);
  useEffect(() => {
    const el = document.documentElement;
    // Only clear a theme we set ourselves; a host page may set data-theme too.
    if (settings.theme === 'system') {
      if (el.dataset.themeOwner === 'app') {
        el.removeAttribute('data-theme');
        delete el.dataset.themeOwner;
      }
    } else {
      el.setAttribute('data-theme', settings.theme);
      el.dataset.themeOwner = 'app';
    }
    el.setAttribute('data-colorblind', String(settings.colorblind));
    el.setAttribute('data-motion', reducedMotion ? 'reduced' : 'full');
    saveSettings(settings);
  }, [settings, reducedMotion]);

  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);

  /** Chooses and loads the puzzle to show. */
  const choose = useCallback(
    async (d: StaticData, preferToday = false) => {
      const nowDate = new Date(Date.now() + clockOffsetFromHeader(d.serverDate));
      const t = puzzleDateAt(nowDate);
      const next: Banner[] = storageAvailable() ? [] : [{ kind: 'storage', text: "Stats won't be saved in this browser." }];

      // F8: a puzzle started before the reset can still be finished; it counts for its own date.
      const active = loadActiveDate();
      if (!preferToday && active && active === addDays(t, -1) && loadGame(active)?.status === 'in_progress') {
        const p = await loadPuzzle(active);
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
      setPuzzle(p);
      setMissing(late);
      setBanners(late ? [...next, { kind: 'late', text: "Today's puzzle is running late. Here's the most recent one." }] : next);
    },
    [],
  );

  useEffect(() => {
    loadStatic()
      .then((d) => {
        setOffset(clockOffsetFromHeader(d.serverDate));
        setData(d);
        return choose(d);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [choose]);

  // Re-evaluate the date every 30 s; pick up a late puzzle without a reload.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (data && missing && tick) choose(data, true);
  }, [tick, data, missing, choose]);

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
    choose(data, true);
  };

  const stats = loadStats();

  return (
    <div className="min-h-dvh">
      <nav className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-1 px-2 lg:px-6">
          <p className="ml-2 mr-auto flex items-baseline gap-2">
            <span className="font-display text-[19px] font-bold tracking-wide">{GAME_NAME}</span>
            {puzzle && <span className="text-[14px] font-semibold tabular-nums text-muted">#{puzzle.puzzleNo}</span>}
          </p>
          <button type="button" onClick={() => setDialog('help')} aria-label="How to play" className="flex h-11 w-11 items-center justify-center rounded-md text-muted hover:text-ink">
            <HelpIcon />
          </button>
          <button type="button" onClick={() => setDialog('stats')} aria-label="Stats" className="flex h-11 w-11 items-center justify-center rounded-md text-muted hover:text-ink">
            <StatsIcon />
          </button>
          <button type="button" onClick={() => setDialog('settings')} aria-label="Settings" className="flex h-11 w-11 items-center justify-center rounded-md text-muted hover:text-ink">
            <GearIcon />
          </button>
        </div>
      </nav>

      {banners.map((b) => (
        <div key={b.kind} role="status" className={`border-b border-line px-4 py-2 text-center text-sm ${b.kind === 'late' ? 'bg-s-orange/20' : 'bg-panel'}`}>
          {b.text}
        </div>
      ))}
      {newPuzzleReady && !endOpen && (
        <div role="status" className="flex items-center justify-center gap-3 border-b border-line bg-panel px-4 py-1.5 text-sm">
          A new puzzle is ready.
          <button type="button" onClick={playNew} className="h-9 rounded-md bg-gold px-3 font-bold text-bg">
            Play #{puzzle ? puzzle.puzzleNo + 1 : ''}
          </button>
        </div>
      )}

      {error ? (
        <p className="mx-auto max-w-md px-4 py-16 text-center text-muted">{error}</p>
      ) : !data || !puzzle ? (
        <p className="py-24 text-center text-muted" aria-live="polite">
          Loading today's puzzle…
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
        />
      )}

      {/* F12 footer / legal */}
      <footer className="mx-auto max-w-[1120px] px-4 pb-10 pt-4 text-[13px] leading-relaxed text-muted lg:px-6">
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
      {dialog === 'stats' && <StatsDialog stats={stats} streak={displayStreak(stats, today)} saved={storageAvailable()} onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog settings={settings} onChange={setSettings} onClose={() => setDialog(null)} />}
      <Toast message={toastMsg} />
    </div>
  );
}
