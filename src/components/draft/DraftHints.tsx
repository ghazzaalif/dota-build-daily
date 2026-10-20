// Draft F5 hints panel (§5.3). Same look as Build's: hairline-ruled rows, locked
// placeholders that say what unlocks them, early reveal with a first-time confirm.
import { useState, type ReactNode } from 'react';
import { formatClock } from '../../game/date';
import { DRAFT_HINTS, MAX_DRAFT_HINT_LEVEL, type DraftHintDef } from '../../game/draft/hints';
import { ATTR_LABEL, POS_LABEL, type DraftPuzzle, type Pos } from '../../game/draft/types';
import type { HeroesMap } from '../../game/types';
import { BulbIcon, LockIcon } from '../Icons';
import { ATTR_CLASS } from './DraftGrid';

interface Props {
  puzzle: DraftPuzzle;
  heroes: HeroesMap;
  level: number;
  solved: boolean[];
  lifeline: { slot: number; heroId: number } | null;
  playing: boolean;
  confirmSeen: boolean;
  onReveal: () => void;
  onConfirmSeen: () => void;
}

export function DraftHints(p: Props) {
  const [confirming, setConfirming] = useState(false);
  const next = DRAFT_HINTS.find((h) => h.level === p.level + 1);
  const { hints } = p.puzzle;
  const slotList = (render: (i: number) => ReactNode, onlyOpen = false) => (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
      {hints.positions.map((_, i) =>
        onlyOpen && p.solved[i] ? null : (
          <li key={i} className="flex gap-2">
            <span className="w-12 shrink-0 text-muted">Pick {i + 1}</span>
            <span className="min-w-0 truncate">{render(i)}</span>
          </li>
        ),
      )}
    </ul>
  );

  const body = (h: DraftHintDef) => {
    switch (h.id) {
      case 'positions':
        return slotList((i) => POS_LABEL[hints.positions[i] as Pos]);
      case 'teams': {
        const won = hints.result === 'win';
        return (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold">{hints.teams.hidden}</span>
            <span className="text-muted">vs</span>
            <span>{hints.teams.enemy}</span>
            <span className="text-muted">—</span>
            <span>
              {won ? `${hints.teams.hidden} won` : `${hints.teams.enemy} won`} in{' '}
              <span className="font-display text-lead font-bold tabular-nums">{formatClock(hints.durationSec)}</span>
            </span>
          </p>
        );
      }
      case 'players':
        return slotList((i) => <span className="font-semibold">{hints.players[i]}</span>);
      case 'attributes': {
        const open = p.solved.some((s) => !s);
        return open ? (
          slotList((i) => <span className={`font-semibold ${ATTR_CLASS[hints.attributes[i]]}`}>{ATTR_LABEL[hints.attributes[i]]}</span>, true)
        ) : (
          <p className="text-muted">Every pick is solved.</p>
        );
      }
      case 'lifeline':
        return p.lifeline ? (
          <p>
            Pick {p.lifeline.slot + 1} is <b className="font-semibold">{p.heroes[p.lifeline.heroId]?.name}</b>. It's locked into your next row.
          </p>
        ) : null;
    }
  };

  const reveal = () => {
    if (!p.confirmSeen) return setConfirming(true);
    p.onReveal();
  };

  return (
    <section aria-labelledby="draft-hints-heading">
      <div className="flex min-h-[44px] items-center justify-between gap-3 border-b border-line pb-2">
        <h2 id="draft-hints-heading" className="text-lead font-semibold">
          Hints
        </h2>
        {p.playing && p.level < MAX_DRAFT_HINT_LEVEL && next && !confirming && (
          <button type="button" onClick={reveal} className="flex h-11 items-center gap-1.5 text-small font-semibold text-ink underline-offset-4 hover:underline">
            <BulbIcon className="h-4 w-4" /> Reveal {next.title.toLowerCase()}
          </button>
        )}
      </div>

      {confirming && next && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-3">
          <p className="mr-auto text-small">Reveal “{next.title}” now? Early hints show as 💡 in your share.</p>
          <button type="button" onClick={() => setConfirming(false)} className="h-11 px-3 text-small font-semibold text-muted">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              p.onConfirmSeen();
              p.onReveal();
            }}
            className="h-11 rounded-[3px] bg-ink px-4 text-small font-bold text-bg"
          >
            Reveal hint
          </button>
        </div>
      )}

      <ol>
        {DRAFT_HINTS.map((h) => {
          const open = h.level <= p.level;
          return (
            <li key={h.id} className="flex gap-3 border-b border-line py-3">
              <span aria-hidden="true" className={`w-4 shrink-0 font-display text-lead font-bold leading-6 ${open ? 'text-ink' : 'text-muted'}`}>
                {h.level}
              </span>
              <div className="min-w-0 flex-1 text-small">
                <h3 className="text-label font-semibold text-muted">{h.title}</h3>
                {open ? (
                  <div className="mt-1.5">{body(h)}</div>
                ) : (
                  <p className="mt-0.5 flex items-center gap-1.5 text-label text-muted">
                    <LockIcon className="h-3.5 w-3.5" /> {h.afterRow === 0 ? 'Shown from the start' : `Unlocks after guess ${h.afterRow}`}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
