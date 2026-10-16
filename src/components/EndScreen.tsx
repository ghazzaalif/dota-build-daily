// F6 end screen: result, the real build timeline, match facts, share, stats, countdown.
import { useEffect, useState } from 'react';
import { formatClock, formatCountdown, msUntilNextReset } from '../game/date';
import type { Stats } from '../game/storage';
import type { AnswerEntry, ItemsMap, Puzzle } from '../game/types';
import { StatsBlock } from './Dialogs';
import { Coin, ExternalIcon, ItemImage, ShareIcon } from './Icons';
import { Modal } from './Modal';

interface Props {
  puzzle: Puzzle;
  answer: AnswerEntry[];
  items: ItemsMap;
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
}

export function useCountdown(now: () => Date) {
  const [ms, setMs] = useState(() => msUntilNextReset(now()));
  useEffect(() => {
    const t = setInterval(() => setMs(msUntilNextReset(now())), 1000);
    return () => clearInterval(t);
  }, [now]);
  return ms;
}

export function EndScreen(p: Props) {
  const ms = useCountdown(p.now);
  const { match, hints } = p.puzzle;
  const playerWon = hints.result === 'win';
  const radiantWon = (match.playerSide === 'radiant') === playerWon;
  const teams = [
    { name: match.radiantTeam, side: 'Radiant', bar: 'bg-radiant', won: radiantWon },
    { name: match.direTeam, side: 'Dire', bar: 'bg-dire', won: !radiantWon },
  ];
  const link = 'inline-flex min-h-[44px] items-center gap-1.5 font-semibold underline decoration-line underline-offset-4 hover:decoration-ink';

  return (
    <Modal title={p.won ? `Solved in ${p.rowsUsed} ${p.rowsUsed === 1 ? 'row' : 'rows'}` : 'Out of rows'} onClose={p.onClose} wide>
      <p className="-mt-2 mb-5 text-small text-muted">
        {hints.player.name}'s final {p.puzzle.hero.name} items, in the order he bought them.
        {p.hintsUsed > 0 && ` You revealed ${p.hintsUsed} ${p.hintsUsed === 1 ? 'hint' : 'hints'} early.`}
      </p>

      <ol className="border-t border-line" aria-label="Final inventory, in purchase order">
        {p.answer.map((a) => {
          const item = p.items[a.key];
          return (
            <li key={a.key} className="flex items-center gap-3 border-b border-line py-2">
              <span className="w-14 shrink-0 font-display text-lead font-bold tabular-nums">{formatClock(a.timeSec)}</span>
              <ItemImage item={item} className="h-[32px] w-[44px] shrink-0 rounded-[2px]" />
              <span className="min-w-0 flex-1 truncate font-semibold">{item?.name}</span>
              <span className="flex items-center gap-1 text-label tabular-nums text-gold">
                <Coin /> {item?.cost.toLocaleString('en-US')}
              </span>
            </li>
          );
        })}
      </ol>

      <section aria-label="Match" className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-label font-semibold text-muted">{p.puzzle.tournament.stage}</h3>
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

      <div className="mt-6 border-t border-line pt-5">
        <StatsBlock stats={p.stats} streak={p.streak} />
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
        {p.newPuzzleReady ? (
          <button type="button" onClick={p.onPlayNew} className="h-12 w-full rounded-[3px] bg-ink font-bold text-bg">
            Play today's puzzle
          </button>
        ) : (
          <>
            <span className="text-small text-muted">Next puzzle in</span>
            <span className="font-display text-h2 font-extrabold tabular-nums">{formatCountdown(ms)}</span>
          </>
        )}
      </div>
    </Modal>
  );
}
