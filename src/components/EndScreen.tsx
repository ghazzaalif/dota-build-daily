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
  const winner = (match.playerSide === 'radiant') === playerWon ? match.radiantTeam : match.direTeam;

  return (
    <Modal title={p.won ? `Solved in ${p.rowsUsed} ${p.rowsUsed === 1 ? 'row' : 'rows'}` : 'Out of rows'} onClose={p.onClose} wide>
      <p className="-mt-1 mb-4 text-[15px] text-muted">
        {hints.player.name}'s final {p.puzzle.hero.name} inventory in {p.puzzle.tournament.name}, ordered by when each item was bought
        {p.hintsUsed > 0 && `. You used ${p.hintsUsed} early ${p.hintsUsed === 1 ? 'hint' : 'hints'}`}.
      </p>

      <ol className="space-y-1.5" aria-label="Final inventory, in purchase order">
        {p.answer.map((a, i) => {
          const item = p.items[a.key];
          return (
            <li key={a.key} className="flex items-center gap-3">
              <span className="w-4 text-right text-[13px] font-semibold tabular-nums text-muted">{i + 1}</span>
              <ItemImage item={item} className="h-[32px] w-[44px] shrink-0 rounded-[3px]" />
              <span className="min-w-0 flex-1 truncate font-semibold">{item?.name}</span>
              <span className="flex items-center gap-1 text-[13px] tabular-nums text-gold">
                <Coin /> {item?.cost.toLocaleString('en-US')}
              </span>
              <span className="w-12 text-right font-semibold tabular-nums">{formatClock(a.timeSec)}</span>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 rounded-lg bg-raised p-3 text-[15px]">
        <p>
          <b className="font-semibold">{match.radiantTeam}</b> vs <b className="font-semibold">{match.direTeam}</b>
        </p>
        <p className="text-muted">
          {p.puzzle.tournament.stage}. {winner} won in {formatClock(hints.durationSec)}.
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4">
          <a href={`https://www.opendota.com/matches/${match.matchId}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-gold hover:underline">
            OpenDota <ExternalIcon className="h-3.5 w-3.5" />
          </a>
          <a href={`https://www.dotabuff.com/matches/${match.matchId}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-gold hover:underline">
            Dotabuff <ExternalIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <button type="button" onClick={p.onShare} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-gold text-[17px] font-bold text-bg">
        <ShareIcon className="h-5 w-5" /> Share result
      </button>

      <div className="mt-5 border-t border-line pt-4">
        <StatsBlock stats={p.stats} streak={p.streak} />
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
        {p.newPuzzleReady ? (
          <button type="button" onClick={p.onPlayNew} className="h-11 w-full rounded-md bg-ink font-bold text-bg">
            Play today's puzzle
          </button>
        ) : (
          <>
            <span className="text-muted">Next puzzle in</span>
            <span className="font-display text-2xl font-bold tabular-nums">{formatCountdown(ms)}</span>
          </>
        )}
      </div>
    </Modal>
  );
}
