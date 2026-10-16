// F5 hints panel (§5.4): locked placeholders show what unlocks them; early reveal
// asks for confirmation the first time only. Laid out as hairline-ruled rows (no card):
// the number is the real unlock order.
import { useState } from 'react';
import { formatClock } from '../game/date';
import { formatBand, HINTS, MAX_HINT_LEVEL, type HintDef } from '../game/hints';
import type { HeroesMap, ItemsMap, Puzzle } from '../game/types';
import { BulbIcon, HeroImage, LockIcon } from './Icons';

interface Props {
  puzzle: Puzzle;
  heroes: HeroesMap;
  items: ItemsMap;
  level: number;
  solved: boolean[];
  lifeline: { slot: number; key: string } | null;
  playing: boolean;
  confirmSeen: boolean;
  onReveal: () => void;
  onConfirmSeen: () => void;
}

function Draft({ ids, heroes, label, highlightFirst }: { ids: number[]; heroes: HeroesMap; label: string; highlightFirst?: boolean }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <p className="shrink-0 text-label text-muted sm:w-[84px]">{label}</p>
      <ul className="flex min-w-0 gap-1">
        {ids.map((id, i) => (
          <li key={id} title={heroes[id]?.name} className="min-w-0 max-w-[56px] flex-1">
            <HeroImage
              hero={heroes[id]}
              className={`aspect-[16/9] w-full rounded-[2px] ${highlightFirst && i === 0 ? 'outline outline-2 outline-offset-1 outline-ink' : ''}`}
            />
            <span className="sr-only">{heroes[id]?.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HintsPanel(p: Props) {
  const [confirming, setConfirming] = useState(false);
  const next = HINTS.find((h) => h.level === p.level + 1);

  const body = (h: HintDef) => {
    const { hints, match } = p.puzzle;
    switch (h.id) {
      case 'draft':
        return (
          <div className="space-y-2.5 sm:space-y-1.5">
            <Draft ids={hints.allies} heroes={p.heroes} label="His team" highlightFirst />
            <Draft ids={hints.enemies} heroes={p.heroes} label="Opponents" />
          </div>
        );
      case 'result': {
        const radiant = match.playerSide === 'radiant';
        return (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold">
              {hints.result === 'win' ? 'Won' : 'Lost'} in <span className="font-display text-lead font-bold tabular-nums">{formatClock(hints.durationSec)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted">
              <span aria-hidden="true" className={`h-3 w-1 ${radiant ? 'bg-radiant' : 'bg-dire'}`} />
              Playing {radiant ? 'Radiant' : 'Dire'}
            </span>
          </p>
        );
      }
      case 'player':
        return (
          <p>
            <span className="font-semibold">{hints.player.name}</span> <span className="text-muted">for</span> {hints.player.team}
          </p>
        );
      case 'prices': {
        const open = hints.priceBands.map((b, i) => ({ b, i })).filter(({ i }) => !p.solved[i]);
        return open.length ? (
          <ul className="grid grid-cols-1 gap-x-6 gap-y-0.5 tabular-nums sm:grid-cols-2">
            {open.map(({ b, i }) => (
              <li key={i} className="flex gap-2">
                <span className="w-12 shrink-0 text-muted">Slot {i + 1}</span>
                <span>{formatBand(b)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">Every slot is solved.</p>
        );
      }
      case 'lifeline':
        return p.lifeline ? (
          <p>
            Slot {p.lifeline.slot + 1} is <b className="font-semibold">{p.items[p.lifeline.key]?.name}</b>. It's locked into your next row.
          </p>
        ) : null;
    }
  };

  const reveal = () => {
    if (!p.confirmSeen) return setConfirming(true);
    p.onReveal();
  };

  return (
    <section aria-labelledby="hints-heading">
      <div className="flex min-h-[44px] items-center justify-between gap-3 border-b border-line pb-2">
        <h2 id="hints-heading" className="text-lead font-semibold">
          Hints
        </h2>
        {p.playing && p.level < MAX_HINT_LEVEL && next && !confirming && (
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
        {HINTS.map((h) => {
          const open = h.level <= p.level;
          return (
            <li key={h.id} className="flex gap-3 border-b border-line py-3">
              <span aria-hidden="true" className={`w-4 shrink-0 font-display text-lead font-bold leading-6 ${open ? 'text-ink' : 'text-muted'}`}>
                {h.level}
              </span>
              <div className="min-w-0 flex-1 text-small">
                <h3 className={`text-label font-semibold ${open ? 'text-muted' : 'text-muted'}`}>{h.title}</h3>
                {open ? (
                  <div className="mt-1.5">{body(h)}</div>
                ) : (
                  <p className="mt-0.5 flex items-center gap-1.5 text-label text-muted">
                    <LockIcon className="h-3.5 w-3.5" /> Unlocks after guess {h.afterRow}
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
