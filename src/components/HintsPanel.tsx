// F5 hints panel (§5.4): locked placeholders show what unlocks them; early reveal
// asks for confirmation the first time only.
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

function Draft({ ids, heroes, label }: { ids: number[]; heroes: HeroesMap; label: string }) {
  return (
    <div>
      <p className="mb-1 text-[12px] text-muted">{label}</p>
      <ul className="flex gap-1">
        {ids.map((id, i) => (
          <li key={id} title={heroes[id]?.name} className="w-[44px]">
            <HeroImage hero={heroes[id]} className={`aspect-[16/9] w-full rounded-[3px] ${i === 0 && label === 'Allies' ? 'ring-2 ring-gold' : ''}`} />
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
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Draft ids={hints.allies} heroes={p.heroes} label="Allies" />
            <Draft ids={hints.enemies} heroes={p.heroes} label="Enemies" />
          </div>
        );
      case 'result':
        return (
          <p>
            {hints.result === 'win' ? 'Won' : 'Lost'} in {formatClock(hints.durationSec)}
            <span className="text-muted"> playing {match.playerSide === 'radiant' ? 'Radiant' : 'Dire'}</span>
          </p>
        );
      case 'player':
        return (
          <p>
            {hints.player.name} <span className="text-muted">for</span> {hints.player.team}
          </p>
        );
      case 'prices': {
        const open = hints.priceBands.map((b, i) => ({ b, i })).filter(({ i }) => !p.solved[i]);
        return open.length ? (
          <ul className="grid grid-cols-1 gap-x-6 gap-y-0.5 tabular-nums sm:grid-cols-2">
            {open.map(({ b, i }) => (
              <li key={i}>
                <span className="text-muted">Slot {i + 1}</span> {formatBand(b)}
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
    <section aria-label="Hints" className="rounded-lg border border-line bg-panel">
      <ol className="divide-y divide-line">
        {HINTS.map((h) => {
          const open = h.level <= p.level;
          return (
            <li key={h.id} className="flex gap-3 px-3 py-2.5">
              <span className={`mt-0.5 text-[13px] font-semibold ${open ? 'text-gold' : 'text-muted/70'}`}>{h.level}</span>
              <div className="min-w-0 flex-1 text-[15px] leading-snug">
                <p className={`text-[13px] font-semibold ${open ? 'text-muted' : 'text-muted/70'}`}>{h.title}</p>
                {open ? (
                  <div className="mt-1">{body(h)}</div>
                ) : (
                  <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted/70">
                    <LockIcon className="h-3.5 w-3.5" /> Unlocks after guess {h.afterRow}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {p.playing && p.level < MAX_HINT_LEVEL && next && (
        <div className="border-t border-line px-3 py-2.5">
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-auto text-sm">Reveal “{next.title}” now? Early hints show as 💡 in your share.</p>
              <button type="button" onClick={() => setConfirming(false)} className="h-11 rounded-md px-3 text-sm font-semibold text-muted">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  p.onConfirmSeen();
                  p.onReveal();
                }}
                className="h-11 rounded-md bg-gold px-4 text-sm font-bold text-bg"
              >
                Reveal hint
              </button>
            </div>
          ) : (
            <button type="button" onClick={reveal} className="flex h-11 items-center gap-2 rounded-md px-1 text-sm font-semibold text-gold hover:underline">
              <BulbIcon className="h-4 w-4" /> Reveal next hint: {next.title.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
