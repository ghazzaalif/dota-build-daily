// Draft F6 end screen: the full draft revealed, the hidden picks with player and position,
// match facts with OpenDota/Dotabuff links, share, stats, countdown, and a link to Build.
import type { MouseEvent } from 'react';
import { formatClock, formatCountdown } from '../../game/date';
import { POS_LABEL, type DraftPuzzle, type DraftSecret, type Pos } from '../../game/draft/types';
import type { Stats } from '../../game/storage';
import type { HeroesMap } from '../../game/types';
import { StatsBlock } from '../Dialogs';
import { useCountdown } from '../EndScreen';
import { ExternalIcon, HeroImage, ShareIcon } from '../Icons';
import { Modal } from '../Modal';
import { DraftBoard } from './DraftBoard';

interface Props {
  puzzle: DraftPuzzle;
  secret: DraftSecret;
  heroes: HeroesMap;
  won: boolean;
  rowsUsed: number;
  hintsUsed: number;
  stats: Stats;
  streak: number;
  now: () => Date;
  onShare: () => void;
  onClose: () => void;
  newPuzzleReady: boolean;
  onPlayNew: () => void;
  buildDone: boolean;
  onGoBuild?: () => void;
}

export function DraftEndScreen(p: Props) {
  const ms = useCountdown(p.now);
  const { hints, hiddenSide } = p.puzzle;
  const { match, answer } = p.secret;
  const hiddenWon = hints.result === 'win';
  const radiantWon = (hiddenSide === 'radiant') === hiddenWon;
  const teams = [
    { name: match.radiantTeam, side: 'Radiant', bar: 'bg-radiant', won: radiantWon },
    { name: match.direTeam, side: 'Dire', bar: 'bg-dire', won: !radiantWon },
  ];
  const link = 'inline-flex min-h-[44px] items-center gap-1.5 font-semibold underline decoration-line underline-offset-4 hover:decoration-ink';
  const goBuild = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!p.onGoBuild || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    p.onGoBuild();
  };

  return (
    <Modal title={p.won ? `Solved in ${p.rowsUsed} ${p.rowsUsed === 1 ? 'row' : 'rows'}` : 'Out of rows'} onClose={p.onClose} wide>
      <p className="-mt-2 mb-5 text-small text-muted">
        {hints.teams.hidden}'s draft, in the order they picked.
        {p.hintsUsed > 0 && ` You revealed ${p.hintsUsed} ${p.hintsUsed === 1 ? 'hint' : 'hints'} early.`}
      </p>

      <ol className="border-t border-line" aria-label="Hidden picks, in pick order">
        {answer.map((id, i) => (
          <li key={id} className="flex items-center gap-3 border-b border-line py-2">
            <span className="w-14 shrink-0 font-display text-lead font-bold tabular-nums">Pick {i + 1}</span>
            <HeroImage hero={p.heroes[id]} className="aspect-[16/9] w-[56px] shrink-0 rounded-[2px]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{p.heroes[id]?.name}</span>
              <span className="block truncate text-label text-muted">
                {hints.players[i]} · {POS_LABEL[hints.positions[i] as Pos]}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-5">
        <DraftBoard puzzle={p.puzzle} heroes={p.heroes} known={answer} showPositions showTeams players={hints.players} compact />
      </div>

      <section aria-label="Match" className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-label font-semibold text-muted">
            {p.puzzle.tournament.name} · {p.puzzle.tournament.stage}
          </h3>
          <span className="font-display text-lead font-bold tabular-nums">{formatClock(hints.durationSec)}</span>
        </div>
        <ul className="mt-2 space-y-1">
          {teams.map((t) => (
            <li key={t.side} className="flex items-center gap-3 bg-raised py-2 pr-3">
              <span aria-hidden="true" className={`w-1 self-stretch ${t.bar}`} />
              <span className={`min-w-0 flex-1 truncate ${t.won ? 'font-bold' : 'text-muted'}`}>{t.name}</span>
              <span className="text-label text-muted">{t.side}</span>
              <span className={`w-12 text-right text-label font-bold ${t.won ? '' : 'invisible'}`}>{t.won ? 'Won' : 'Lost'}</span>
            </li>
          ))}
        </ul>
        <div className="mt-1 flex flex-wrap gap-x-5">
          <a href={`https://www.opendota.com/matches/${match.matchId}`} target="_blank" rel="noopener noreferrer" className={link}>
            OpenDota <ExternalIcon className="h-3.5 w-3.5" />
          </a>
          <a href={`https://www.dotabuff.com/matches/${match.matchId}`} target="_blank" rel="noopener noreferrer" className={link}>
            Dotabuff <ExternalIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      </section>

      <button type="button" onClick={p.onShare} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-[3px] bg-ink text-lead font-bold text-bg">
        <ShareIcon className="h-5 w-5" /> Share result
      </button>

      <a href="/" onClick={goBuild} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-[3px] bg-raised font-semibold">
        {p.buildDone ? (
          <>
            <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center bg-s-green text-[11px] text-[var(--s-ink)]">
              ✓
            </span>
            Today's Build puzzle is done
          </>
        ) : (
          <>Also play today's Build puzzle →</>
        )}
      </a>

      <div className="mt-6 border-t border-line pt-5">
        <StatsBlock stats={p.stats} streak={p.streak} />
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
        {p.newPuzzleReady ? (
          <button type="button" onClick={p.onPlayNew} className="h-12 w-full rounded-[3px] bg-ink font-bold text-bg">
            Play today's draft
          </button>
        ) : (
          <>
            <span className="text-small text-muted">Next draft in</span>
            <span className="font-display text-h2 font-extrabold tabular-nums">{formatCountdown(ms)}</span>
          </>
        )}
      </div>
    </Modal>
  );
}
