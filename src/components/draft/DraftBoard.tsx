// Draft F2: the Captain's Mode board, rendered from picks_bans exactly as recorded (D4).
// Consecutive entries of one type form a phase. Each phase is a two-lane block, hidden team
// on top and enemy below, with every entry in its own column, so the turn order reads left
// to right. Blocks wrap onto new lines on narrow screens; nothing scrolls sideways.
import type { DraftEntry, DraftPuzzle, Pos } from '../../game/draft/types';
import { POS_SHORT } from '../../game/draft/types';
import type { HeroesMap } from '../../game/types';
import { HeroImage } from '../Icons';

interface Props {
  puzzle: DraftPuzzle;
  heroes: HeroesMap;
  /** Hero per slot (index 0 = slot 1) when known: solved, lifeline, or the end-screen reveal. */
  known: (number | null)[];
  /** Show each hidden slot's position (once the hint is open). */
  showPositions: boolean;
  /** Show team names (once the hint is open, or at the end). */
  showTeams: boolean;
  /** End screen: player names under hidden picks. */
  players?: string[];
  compact?: boolean;
}

interface Phase {
  type: 'ban' | 'pick';
  entries: DraftEntry[];
}

export function phasesOf(draft: DraftEntry[]): Phase[] {
  const out: Phase[] = [];
  for (const e of draft) {
    const last = out[out.length - 1];
    if (last && last.type === e.type) last.entries.push(e);
    else out.push({ type: e.type, entries: [e] });
  }
  return out;
}

const SIDE_BAR = { radiant: 'bg-radiant', dire: 'bg-dire' } as const;
const SIDE_NAME = { radiant: 'Radiant', dire: 'Dire' } as const;

function Cell({ e, p }: { e: DraftEntry; p: Props }) {
  const hero = e.heroId !== undefined ? p.heroes[e.heroId] : undefined;
  const box = 'relative block aspect-[16/9] w-full overflow-hidden rounded-[2px]';

  if (e.type === 'ban') {
    return (
      <span className={box} title={`Banned: ${hero?.name}`}>
        <HeroImage hero={hero} className="h-full w-full opacity-45 grayscale" />
        <svg aria-hidden="true" viewBox="0 0 16 9" preserveAspectRatio="none" className="absolute inset-0 h-full w-full text-ink/70">
          <line x1="1" y1="8" x2="15" y2="1" stroke="currentColor" strokeWidth="0.7" />
        </svg>
        <span className="sr-only">
          {e.team === 'hidden' ? 'Hidden team' : 'Enemy'} bans {hero?.name}
        </span>
      </span>
    );
  }

  if (e.team === 'enemy') {
    return (
      <span className={box} title={hero?.name}>
        <HeroImage hero={hero} className="h-full w-full" />
        <span className="sr-only">Enemy picks {hero?.name}</span>
      </span>
    );
  }

  const slot = e.slot!;
  const knownId = p.known[slot - 1];
  const known = knownId !== null && knownId !== undefined ? p.heroes[knownId] : undefined;
  const pos = p.showPositions ? (p.puzzle.hints.positions[slot - 1] as Pos) : null;
  return (
    <span className="flex flex-col gap-0.5">
      <span
        className={`${box} ${known ? 'outline outline-2 -outline-offset-2 outline-s-green' : 'border-2 border-dashed border-muted bg-raised'}`}
        title={known ? `Pick ${slot}: ${known.name}` : `Hidden pick ${slot}`}
      >
        {known ? (
          <HeroImage hero={known} className="h-full w-full" />
        ) : (
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center font-display text-body font-extrabold leading-none text-ink">
            ?{slot}
          </span>
        )}
        <span className="sr-only">
          Hidden pick {slot}
          {known ? `: ${known.name}` : ''}
          {pos ? `, ${POS_SHORT[pos]}` : ''}
        </span>
      </span>
      {(pos || p.players) && (
        <span aria-hidden="true" className="truncate text-center text-[10px] font-semibold leading-3 text-muted">
          {p.players ? p.players[slot - 1] : pos ? POS_SHORT[pos] : ''}
        </span>
      )}
    </span>
  );
}

export function DraftBoard(p: Props) {
  const { puzzle } = p;
  const enemySide: 'radiant' | 'dire' = puzzle.hiddenSide === 'radiant' ? 'dire' : 'radiant';
  const phases = phasesOf(puzzle.draft);
  const counter = { ban: 0, pick: 0 };
  const lanes = [
    {
      team: 'hidden' as const,
      side: puzzle.hiddenSide,
      label: p.showTeams ? puzzle.hints.teams.hidden : 'Hidden team',
      extra: puzzle.hiddenHadFirstPick ? 'First pick' : 'Second pick',
    },
    {
      team: 'enemy' as const,
      side: enemySide,
      label: p.showTeams ? puzzle.hints.teams.enemy : 'Enemy',
      extra: puzzle.hiddenHadFirstPick ? 'Second pick' : 'First pick',
    },
  ];

  return (
    <section aria-label="Draft" className={p.compact ? '' : 'pb-1'}>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-label">
        {lanes.map((l) => (
          <li key={l.team} className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden="true" className={`h-3 w-1 shrink-0 ${SIDE_BAR[l.side]}`} />
            <span className={`truncate ${l.team === 'hidden' ? 'font-semibold' : 'text-muted'}`}>
              {l.team === 'hidden' ? '▲ ' : '▼ '}
              {l.label}
            </span>
            <span className="shrink-0 text-muted">
              · {SIDE_NAME[l.side]} · {l.extra}
            </span>
          </li>
        ))}
      </ul>

      <ol className="flex flex-wrap gap-x-2.5 gap-y-2.5">
        {phases.map((ph, i) => {
          counter[ph.type] += 1;
          const n = ph.entries.length;
          return (
            <li
              key={i}
              className="min-w-0"
              // Width grows with the number of entries, so a 7-ban phase and a 2-pick phase
              // keep the same column width and wrap together.
              style={{ flex: `${n} 1 ${n * 46}px`, maxWidth: `${n * 64}px` }}
            >
              <h3 className="mb-0.5 text-[11px] font-bold uppercase leading-4 tracking-[0.06em] text-muted">
                {ph.type === 'ban' ? 'Bans' : 'Picks'} {counter[ph.type]}
              </h3>
              <div className="grid gap-x-1 gap-y-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
                {lanes.map((l) =>
                  ph.entries.map((e) => (
                    <div key={`${l.team}-${e.order}`} className={`relative min-w-0 ${l.team === 'hidden' ? 'pb-0' : ''}`}>
                      {e.team === l.team ? (
                        <>
                          <Cell e={e} p={p} />
                          <span aria-hidden="true" className={`absolute inset-x-0 ${l.team === 'hidden' ? '-top-[3px]' : '-bottom-[3px]'} h-[2px] ${SIDE_BAR[l.side]} ${e.type === 'ban' ? 'opacity-40' : ''}`} />
                        </>
                      ) : (
                        <span aria-hidden="true" className="block aspect-[16/9] w-full rounded-[2px] bg-raised/40" />
                      )}
                    </div>
                  )),
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
