// Draft F3: 6 rows × 5 slots. Column headers are the hidden team's picks in order; they pick
// up the position, player and attribute as those hints unlock.
import { useEffect, useState, type DragEvent } from 'react';
import { MAX_ROWS, TEAM_SIZE } from '../../config';
import type { DraftState } from '../../game/draft/game';
import { ATTR_LABEL, POS_SHORT, type DraftPuzzle, type DraftTile, type DraftTileState, type Pos } from '../../game/draft/types';
import type { HeroAttr, HeroesMap } from '../../game/types';
import { ChevronLeft, ChevronRight, CloseIcon, HeroImage, LockIcon } from '../Icons';

export const DRAFT_SYMBOL: Record<DraftTileState, string> = { green: '✓', yellow: '↔', grey: '✕' };
export const DRAFT_STATE_TEXT: Record<DraftTileState, string> = {
  green: 'right hero, right pick',
  yellow: 'in the team, wrong pick',
  grey: 'not in the team',
};
const STATE_CLASS: Record<DraftTileState, string> = {
  green: 'border-s-green bg-s-green',
  yellow: 'border-s-yellow bg-s-yellow',
  grey: 'border-s-grey bg-s-grey',
};
export const ATTR_SHORT: Record<HeroAttr, string> = { str: 'STR', agi: 'AGI', int: 'INT', all: 'UNI' };
export const ATTR_CLASS: Record<HeroAttr, string> = {
  str: 'text-[var(--attr-str)]',
  agi: 'text-[var(--attr-agi)]',
  int: 'text-[var(--attr-int)]',
  all: 'text-[var(--attr-all)]',
};

const TILE = 'relative flex aspect-[4/3] min-h-[44px] w-full overflow-hidden rounded-[3px]';

interface Props {
  state: DraftState;
  puzzle: DraftPuzzle;
  heroes: HeroesMap;
  show: { positions: boolean; players: boolean; attributes: boolean };
  solved: boolean[];
  animateLastRow: boolean;
  onSlotTap: (slot: number) => void;
  onSwap: (from: number, to: number) => void;
  onMove: (slot: number, dir: -1 | 1) => void;
  onClear: (slot: number) => void;
  selected: number | null;
  setSelected: (s: number | null) => void;
}

function ScoredTile({ tile, heroes, delay, animate, slot, onInspect, active }: {
  tile: DraftTile;
  heroes: HeroesMap;
  delay: number;
  animate: boolean;
  slot: number;
  onInspect: () => void;
  active: boolean;
}) {
  const hero = heroes[tile.heroId];
  const [revealed, setRevealed] = useState(!animate);
  useEffect(() => {
    if (!animate) return;
    const t = setTimeout(() => setRevealed(true), delay + 250);
    return () => clearTimeout(t);
  }, [animate, delay]);
  const label = `Pick ${slot + 1}: ${hero?.name ?? tile.heroId}, ${DRAFT_STATE_TEXT[tile.state]}`;
  return (
    <button
      type="button"
      onClick={onInspect}
      title={label}
      aria-label={label}
      className={`${TILE} border-[3px] ${revealed ? STATE_CLASS[tile.state] : 'border-line bg-raised'} ${animate ? 'tile-flip' : ''} ${
        active ? 'ring-2 ring-ink ring-offset-2 ring-offset-bg' : ''
      }`}
      style={animate ? { animationDelay: `${delay}ms` } : undefined}
    >
      <HeroImage hero={hero} className={`h-full w-full ${revealed && tile.state === 'grey' ? 'opacity-35 grayscale' : ''}`} />
      {revealed && (
        <span
          aria-hidden="true"
          className={`absolute bottom-0 right-0 flex h-4 min-w-4 items-center justify-center px-[3px] text-meta font-bold leading-none text-[var(--s-ink)] ${STATE_CLASS[tile.state]}`}
        >
          {DRAFT_SYMBOL[tile.state]}
        </span>
      )}
    </button>
  );
}

export function DraftGrid(p: Props) {
  const { state, heroes } = p;
  const [inspect, setInspect] = useState<{ row: number; slot: number } | null>(null);
  const [shake, setShake] = useState(0);
  const playing = state.status === 'in_progress';
  const { hints } = p.puzzle;

  useEffect(() => {
    if (state.error) setShake((n) => n + 1);
  }, [state.error]);
  useEffect(() => setInspect(null), [state.rows.length]);

  const onDragStart = (slot: number) => (e: DragEvent) => e.dataTransfer.setData('text/plain', String(slot));
  const onDrop = (slot: number) => (e: DragEvent) => {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData('text/plain'));
    if (!Number.isNaN(from)) p.onSwap(from, slot);
  };

  const inspected = inspect ? state.scored[inspect.row]?.[inspect.slot] : null;
  const lastRow = state.rows.length - 1;
  const currentIndex = playing ? state.rows.length : -1;
  const cols = 'grid-cols-[1.25rem_repeat(5,minmax(0,1fr))]';

  return (
    <section aria-labelledby="draft-guesses-heading" className="select-none">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="draft-guesses-heading" className="text-lead font-semibold">
          Hidden picks
        </h2>
        <p className="text-label text-muted">In the order they picked</p>
      </div>

      <div className={`grid ${cols} gap-x-1.5 gap-y-1.5`}>
        <span />
        {Array.from({ length: TEAM_SIZE }, (_, i) => {
          const pos = hints.positions[i] as Pos;
          const attr = hints.attributes[i];
          return (
            <div key={i} className="min-w-0 pb-0.5 text-center leading-tight">
              <span className="block font-display text-body font-bold tabular-nums text-muted">Pick {i + 1}</span>
              {p.show.positions && <span className="block truncate text-meta font-semibold">{POS_SHORT[pos]}</span>}
              {p.show.players && <span className="block truncate text-meta text-muted">{hints.players[i]}</span>}
              {p.show.attributes && !p.solved[i] && (
                <span className={`block text-meta font-bold ${ATTR_CLASS[attr]}`} title={ATTR_LABEL[attr]}>
                  {ATTR_SHORT[attr]}
                </span>
              )}
            </div>
          );
        })}

        {Array.from({ length: MAX_ROWS }, (_, r) => {
          const isCurrent = r === currentIndex;
          const scored = state.scored[r];
          return (
            <div key={r} role="group" aria-label={`Guess ${r + 1}`} className="contents">
              <span aria-hidden="true" className={`flex items-center justify-center font-display text-body font-bold tabular-nums ${isCurrent ? 'text-ink' : 'text-muted'}`}>
                {r + 1}
              </span>
              {scored
                ? scored.map((t, i) => (
                    <ScoredTile
                      key={`${r}-${i}-${t.heroId}`}
                      tile={t}
                      heroes={heroes}
                      slot={i}
                      delay={i * 250}
                      animate={p.animateLastRow && r === lastRow}
                      active={inspect?.row === r && inspect.slot === i}
                      onInspect={() => setInspect(inspect?.row === r && inspect.slot === i ? null : { row: r, slot: i })}
                    />
                  ))
                : isCurrent
                  ? state.current.map((id, i) => {
                      const hero = id !== null ? heroes[id] : undefined;
                      const locked = state.lifeline?.slot === i;
                      const isSel = p.selected === i;
                      return (
                        <button
                          key={`cur-${i}-${shake}`}
                          type="button"
                          draggable={!!hero && !locked}
                          onDragStart={onDragStart(i)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={onDrop(i)}
                          onClick={() => p.onSlotTap(i)}
                          aria-label={
                            hero ? `Pick ${i + 1}: ${hero.name}${locked ? ', locked by lifeline' : ''}. Tap to select` : `Pick ${i + 1}: empty. Tap to choose a hero`
                          }
                          aria-pressed={isSel}
                          className={`${TILE} items-center justify-center border-[3px] transition-colors duration-150 ${
                            locked ? 'border-s-green' : isSel ? 'border-ink' : hero ? 'border-raised' : 'border-dashed border-faint hover:border-muted'
                          } ${shake ? 'row-shake' : ''} bg-raised`}
                        >
                          {hero ? (
                            <HeroImage hero={hero} className="h-full w-full" />
                          ) : (
                            <span aria-hidden="true" className="text-lead text-muted">
                              +
                            </span>
                          )}
                          {locked && (
                            <span className="absolute bottom-0 right-0 bg-s-green p-[2px] text-[var(--s-ink)]">
                              <LockIcon className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </button>
                      );
                    })
                  : Array.from({ length: TEAM_SIZE }, (_, i) => <div key={`e-${r}-${i}`} className="aspect-[4/3] min-h-[44px] w-full rounded-[3px] bg-raised/50" />)}
            </div>
          );
        })}
      </div>

      <div className="mt-2 min-h-[44px]" aria-live="polite">
        {playing && p.selected !== null && state.current[p.selected] !== null ? (
          <div className="flex items-center gap-2">
            <span className="mr-auto truncate text-small text-muted">
              Pick {p.selected + 1}: <span className="font-semibold text-ink">{heroes[state.current[p.selected]!]?.name}</span>
            </span>
            <button type="button" onClick={() => p.onMove(p.selected!, -1)} disabled={p.selected === 0} aria-label="Move left" className="flex h-11 w-11 items-center justify-center rounded-[3px] bg-raised disabled:opacity-30">
              <ChevronLeft />
            </button>
            <button type="button" onClick={() => p.onMove(p.selected!, 1)} disabled={p.selected === TEAM_SIZE - 1} aria-label="Move right" className="flex h-11 w-11 items-center justify-center rounded-[3px] bg-raised disabled:opacity-30">
              <ChevronRight />
            </button>
            <button
              type="button"
              onClick={() => {
                p.onClear(p.selected!);
                p.setSelected(null);
              }}
              className="flex h-11 items-center gap-1 rounded-[3px] bg-raised px-3 text-small font-semibold"
            >
              <CloseIcon className="h-4 w-4" /> Remove
            </button>
          </div>
        ) : inspected ? (
          <p className="text-small text-muted [&_b]:font-semibold [&_b]:text-ink">
            <b>{heroes[inspected.heroId]?.name}</b>: {DRAFT_STATE_TEXT[inspected.state]}.
          </p>
        ) : state.scored.length ? (
          <p className="text-small text-muted">Tap a tile to see what it means.</p>
        ) : null}
      </div>
    </section>
  );
}
