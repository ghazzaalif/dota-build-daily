// Shared top bar for both modes, plus the Build | Draft tabs (Draft PRD F10). A tab shows ✓
// when today's puzzle in that mode is finished.
import type { MouseEvent } from 'react';
import { DRAFT_PATH, PLAY_PATH } from '../config';
import { puzzleDateAt } from '../game/date';
import { loadDraftGame } from '../game/draft/storage';
import { loadGame } from '../game/storage';
import { BrandMark } from './BrandMark';
import { GearIcon, HelpIcon, StatsIcon } from './Icons';

export type Mode = 'build' | 'draft';

interface Props {
  mode: Mode;
  title: string;
  puzzleNo?: number;
  onHelp: () => void;
  onStats: () => void;
  onSettings: () => void;
  /** Omitted inside Discord, where only Build mode runs. */
  navigate?: (path: string) => void;
}

function finishedToday() {
  const today = puzzleDateAt(new Date());
  const done = (s: string | undefined) => s === 'won' || s === 'lost';
  return { build: done(loadGame(today)?.status), draft: done(loadDraftGame(today)?.status) };
}

export function TopBar(p: Props) {
  const done = finishedToday();
  const tabs: { mode: Mode; label: string; href: string }[] = [
    { mode: 'build', label: 'Build', href: PLAY_PATH },
    { mode: 'draft', label: 'Draft', href: DRAFT_PATH },
  ];
  const go = (href: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (!p.navigate || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    p.navigate(href);
  };

  return (
    <nav className="sticky top-0 z-30 border-b border-line bg-bg">
      <div className="mx-auto flex h-14 max-w-[1080px] items-center gap-1 px-2 lg:px-6">
        <p className="ml-2 mr-auto flex min-w-0 items-center gap-2.5">
          {p.navigate ? (
            <a href="/" onClick={go('/')} aria-label="About Dota Build Daily" className="shrink-0">
              <BrandMark size={26} />
            </a>
          ) : (
            <BrandMark size={26} className="shrink-0" />
          )}
          <span className="truncate whitespace-nowrap font-display text-body font-extrabold uppercase tracking-[0.02em] sm:text-lead">{p.title}</span>
          {p.puzzleNo !== undefined && <span className="font-display text-body font-bold tabular-nums text-muted sm:text-lead">#{p.puzzleNo}</span>}
        </p>
        <button type="button" onClick={p.onHelp} aria-label="How to play" className="flex h-11 w-11 shrink-0 items-center justify-center text-muted hover:text-ink">
          <HelpIcon />
        </button>
        <button type="button" onClick={p.onStats} aria-label="Stats" className="flex h-11 w-11 shrink-0 items-center justify-center text-muted hover:text-ink">
          <StatsIcon />
        </button>
        <button type="button" onClick={p.onSettings} aria-label="Settings" className="flex h-11 w-11 shrink-0 items-center justify-center text-muted hover:text-ink">
          <GearIcon />
        </button>
      </div>
      {p.navigate && (
        <div className="mx-auto flex max-w-[1080px] px-2 lg:px-6" role="tablist" aria-label="Game mode">
          {tabs.map((t) => {
            const active = t.mode === p.mode;
            return (
              <a
                key={t.mode}
                href={t.href}
                role="tab"
                aria-selected={active}
                aria-label={`${t.label}${done[t.mode] ? ', finished today' : ''}`}
                onClick={go(t.href)}
                className={`-mb-px flex h-11 items-center gap-1.5 border-b-2 px-3 font-display text-body font-bold uppercase tracking-[0.04em] ${
                  active ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {t.label}
                {done[t.mode] && (
                  <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center bg-s-green text-[11px] leading-none text-[var(--s-ink)]">
                    ✓
                  </span>
                )}
              </a>
            );
          })}
        </div>
      )}
    </nav>
  );
}
