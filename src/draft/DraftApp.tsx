// Draft Daily app shell (lazy chunk for /draft): loads the draft for the UTC date (F1) with
// the same carry-over and late-puzzle rules as Build, and hosts the top bar, dialogs and
// footer. A missing Draft file never affects Build Daily.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { track } from '../analytics';
import { DRAFT_GAME_NAME } from '../config';
import { SettingsDialog, StatsDialog } from '../components/Dialogs';
import { DraftHowTo } from '../components/draft/DraftHowTo';
import { DraftScreen } from '../components/draft/DraftScreen';
import { Toast } from '../components/Modal';
import { TopBar } from '../components/TopBar';
import { loadDraftPuzzle, loadDraftStatic, type DraftStaticData } from '../data/load';
import { addDays, clockOffsetFromHeader, puzzleDateAt } from '../game/date';
import { draftTutorialSeen, loadDraftActiveDate, loadDraftGame, loadDraftStats, markDraftTutorialSeen } from '../game/draft/storage';
import type { DraftPuzzle } from '../game/draft/types';
import { displayStreak, storageAvailable } from '../game/storage';
import { useSettings, useToast } from '../useSettings';

type Banner = { kind: 'late' | 'carryover' | 'storage'; text: string };

export default function DraftApp({ navigate }: { navigate?: (path: string) => void }) {
  const [data, setData] = useState<DraftStaticData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [puzzle, setPuzzle] = useState<DraftPuzzle | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const { settings, setSettings, updateSettings, reducedMotion } = useSettings();
  const [dialog, setDialog] = useState<'help' | 'stats' | 'settings' | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const { message, toast } = useToast();
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(0);
  const [missing, setMissing] = useState(false);

  const now = useCallback(() => new Date(Date.now() + offset), [offset]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const today = useMemo(() => puzzleDateAt(now()), [now, tick]);

  const choose = useCallback(async (d: DraftStaticData, preferToday = false) => {
    const t = puzzleDateAt(new Date(Date.now() + clockOffsetFromHeader(d.serverDate)));
    const base: Banner[] = storageAvailable() ? [] : [{ kind: 'storage', text: "Stats won't be saved in this browser." }];

    const active = loadDraftActiveDate();
    if (!preferToday && active && active === addDays(t, -1) && loadDraftGame(active)?.status === 'in_progress') {
      const p = await loadDraftPuzzle(active);
      if (p) {
        setPuzzle(p);
        setMissing(false);
        setBanners([...base, { kind: 'carryover', text: `Finish yesterday's draft #${p.puzzleNo} first. Today's is ready after.` }]);
        return;
      }
    }

    let p = await loadDraftPuzzle(t);
    let late = false;
    if (!p) {
      const latest = [...d.index.dates].filter((x) => x <= t).pop();
      p = latest ? await loadDraftPuzzle(latest) : null;
      late = true;
      track('puzzle_missing', { mode: 'draft', date: t });
    }
    if (!p) {
      setError("Today's draft is running late and there's no earlier one to show. Check back soon, or play today's Build puzzle.");
      return;
    }
    setPuzzle(p);
    setMissing(late);
    setBanners(late ? [...base, { kind: 'late', text: "Today's draft is running late. Here's the most recent one." }] : base);
  }, []);

  useEffect(() => {
    loadDraftStatic()
      .then((d) => {
        setOffset(clockOffsetFromHeader(d.serverDate));
        setData(d);
        return choose(d);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [choose]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (data && missing && tick) choose(data, true);
  }, [tick, data, missing, choose]);

  // F9: tutorial once per browser (its own flag, separate from Build's).
  useEffect(() => {
    if (data && !draftTutorialSeen()) setDialog('help');
  }, [data]);

  const playingDate = puzzle?.date ?? today;
  const newPuzzleReady = !!puzzle && playingDate < today && !missing;
  const playNew = () => {
    if (!data) return;
    setEndOpen(false);
    choose(data, true);
  };
  const stats = loadDraftStats();

  return (
    <div className="min-h-dvh">
      <TopBar
        mode="draft"
        title={DRAFT_GAME_NAME}
        puzzleNo={puzzle?.puzzleNo}
        onHelp={() => setDialog('help')}
        onStats={() => setDialog('stats')}
        onSettings={() => setDialog('settings')}
        navigate={navigate}
      />

      {banners.map((b) => (
        <div key={b.kind} role="status" className="border-b border-line bg-panel px-4 py-2 text-center text-small">
          {b.kind === 'late' && <span aria-hidden="true" className="mr-2 inline-block h-2.5 w-2.5 bg-s-orange align-middle" />}
          {b.text}
        </div>
      ))}
      {newPuzzleReady && !endOpen && (
        <div role="status" className="flex items-center justify-center gap-3 border-b border-line bg-panel px-4 py-1.5 text-small">
          A new draft is ready.
          <button type="button" onClick={playNew} className="h-9 rounded-[3px] bg-ink px-3 font-bold text-bg">
            Play #{puzzle ? puzzle.puzzleNo + 1 : ''}
          </button>
        </div>
      )}

      {error ? (
        <p className="mx-auto max-w-md px-4 py-16 text-center text-small text-muted">{error}</p>
      ) : !data || !puzzle ? (
        <p className="py-24 text-center text-muted" aria-live="polite">
          Loading today's draft…
        </p>
      ) : (
        <DraftScreen
          key={puzzle.date}
          puzzle={puzzle}
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
          navigate={navigate}
        />
      )}

      <footer className="mx-auto max-w-[1080px] px-4 pb-10 pt-6 text-label text-muted lg:px-6">
        Dota 2 is a registered trademark of Valve Corporation. This project is not affiliated with or endorsed by Valve. Match data from OpenDota.
      </footer>

      {dialog === 'help' && (
        <DraftHowTo
          onClose={() => {
            setDialog(null);
            markDraftTutorialSeen();
          }}
        />
      )}
      {dialog === 'stats' && <StatsDialog stats={stats} streak={displayStreak(stats, today)} saved={storageAvailable()} onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog settings={settings} onChange={setSettings} onClose={() => setDialog(null)} />}
      <Toast message={message} />
    </div>
  );
}
