// F3 guess grid: 6 rows × 6 slots. Tiles use the item icon's own 11:8 shape so
// each row reads like a purchase timeline.
import { useEffect, useState, type DragEvent } from 'react';
import { BUILD_SIZE, MAX_ROWS } from '../config';
import type { GameState } from '../game/game';
import type { ItemsMap, ScoredTile, TileState } from '../game/types';
import { ChevronLeft, ChevronRight, CloseIcon, ItemImage, LockIcon } from './Icons';

export const SYMBOL: Record<TileState, string> = { green: '✓', yellow: '↔', orange: '◐', grey: '✕' };
export const STATE_TEXT: Record<TileState, string> = {
  green: 'right item, right slot',
  yellow: 'in the build, wrong slot',
  orange: "shares a component with an item you haven't found",
  grey: 'not in the build',
};

const STATE_CLASS: Record<TileState, string> = {
  green: 'border-s-green bg-s-green',
  yellow: 'border-s-yellow bg-s-yellow',
  orange: 'border-s-orange bg-s-orange',
  grey: 'border-s-grey bg-s-grey',
};

interface Props {
  state: GameState;
  items: ItemsMap;
  animateLastRow: boolean;
  onSlotTap: (slot: number) => void;
  onSwap: (from: number, to: number) => void;
  onMove: (slot: number, dir: -1 | 1) => void;
  onClear: (slot: number) => void;
  selected: number | null;
  setSelected: (s: number | null) => void;
}

function ScoredTileView({ tile, items, delay, animate, onInspect, active }: {
  tile: ScoredTile;
  items: ItemsMap;
  delay: number;
  animate: boolean;
  onInspect: () => void;
  active: boolean;
}) {
  const item = items[tile.key];
  const shared = tile.sharedComponent ? items[tile.sharedComponent]?.name : undefined;
  const [revealed, setRevealed] = useState(!animate);
  useEffect(() => {
    if (!animate) return;
    const t = setTimeout(() => setRevealed(true), delay + 250);
    return () => clearTimeout(t);
  }, [animate, delay]);

  const label = `${item?.name ?? tile.key}, ${STATE_TEXT[tile.state]}${shared ? ` (${shared})` : ''}`;
  return (
    <button
      type="button"
      onClick={onInspect}
      title={tile.state === 'orange' && shared ? `Shares ${shared} with an item you haven't found yet` : label}
      aria-label={label}
      className={`relative flex aspect-[11/8] min-h-[44px] w-full flex-col overflow-hidden rounded-[5px] border-2 ${
        revealed ? STATE_CLASS[tile.state] : 'border-line bg-raised'
      } ${animate ? 'tile-flip' : ''} ${active ? 'ring-2 ring-ink ring-offset-1 ring-offset-bg' : ''}`}
      style={animate ? { animationDelay: `${delay}ms` } : undefined}
    >
      {item && <ItemImage item={item} className={`h-full w-full ${revealed && tile.state === 'grey' ? 'opacity-40 grayscale' : ''}`} />}
      {revealed && (
        <span
          aria-hidden="true"
          className={`absolute bottom-0 right-0 flex h-[15px] min-w-[15px] items-center justify-center rounded-tl-[4px] px-[2px] text-[11px] font-bold leading-none text-[var(--s-ink)] ${STATE_CLASS[tile.state]}`}
        >
          {SYMBOL[tile.state]}
        </span>
      )}
    </button>
  );
}

export function Grid({ state, items, animateLastRow, onSlotTap, onSwap, onMove, onClear, selected, setSelected }: Props) {
  const [inspect, setInspect] = useState<{ row: number; slot: number } | null>(null);
  const [shake, setShake] = useState(0);
  const playing = state.status === 'in_progress';

  useEffect(() => {
    if (state.error) setShake((n) => n + 1);
  }, [state.error]);
  useEffect(() => setInspect(null), [state.rows.length]);

  const onDragStart = (slot: number) => (e: DragEvent) => e.dataTransfer.setData('text/plain', String(slot));
  const onDrop = (slot: number) => (e: DragEvent) => {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData('text/plain'));
    if (!Number.isNaN(from)) onSwap(from, slot);
  };

  const inspected = inspect ? state.scored[inspect.row]?.[inspect.slot] : null;
  const inspectedText = (() => {
    if (!inspected) return null;
    const name = items[inspected.key]?.name ?? inspected.key;
    if (inspected.state === 'orange' && inspected.sharedComponent) {
      return (
        <>
          <b>{name}</b> shares <b>{items[inspected.sharedComponent]?.name}</b> with an item you haven't found yet.
        </>
      );
    }
    return (
      <>
        <b>{name}</b>: {STATE_TEXT[inspected.state]}.
      </>
    );
  })();

  const lastRow = state.rows.length - 1;
  const currentIndex = playing ? state.rows.length : -1;

  return (
    <section aria-label="Guesses" className="select-none lg:max-w-[560px]">
      <div className="grid grid-cols-[1.25rem_repeat(6,minmax(0,1fr))] gap-x-[5px] gap-y-[6px]">
        <span />
        {Array.from({ length: BUILD_SIZE }, (_, i) => (
          <span key={i} className="pb-0.5 text-center text-[12px] font-semibold tabular-nums text-muted">
            {i + 1}
          </span>
        ))}

        {Array.from({ length: MAX_ROWS }, (_, r) => {
          const isCurrent = r === currentIndex;
          const scored = state.scored[r];
          return (
            <div key={r} role="group" aria-label={`Guess ${r + 1}`} className="contents">
              <span className={`flex items-center justify-center text-[11px] tabular-nums ${isCurrent ? 'font-bold text-gold' : 'text-muted/60'}`}>
                {r + 1}
              </span>
              {scored
                ? scored.map((t, i) => (
                    <ScoredTileView
                      key={`${r}-${i}-${t.key}`}
                      tile={t}
                      items={items}
                      delay={i * 250}
                      animate={animateLastRow && r === lastRow}
                      active={inspect?.row === r && inspect.slot === i}
                      onInspect={() => setInspect(inspect?.row === r && inspect.slot === i ? null : { row: r, slot: i })}
                    />
                  ))
                : isCurrent
                  ? state.current.map((key, i) => {
                      const item = key ? items[key] : undefined;
                      const locked = state.lifeline?.slot === i;
                      const isSel = selected === i;
                      return (
                        <button
                          key={`cur-${i}-${shake}`}
                          type="button"
                          draggable={!!key && !locked}
                          onDragStart={onDragStart(i)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={onDrop(i)}
                          onClick={() => onSlotTap(i)}
                          aria-label={
                            item
                              ? `Slot ${i + 1}: ${item.name}${locked ? ', locked by lifeline' : ''}. Tap to select`
                              : `Slot ${i + 1}: empty. Tap to pick an item`
                          }
                          aria-pressed={isSel}
                          className={`relative flex aspect-[11/8] min-h-[44px] w-full items-center justify-center overflow-hidden rounded-[5px] border-2 transition-colors ${
                            locked
                              ? 'border-s-green'
                              : isSel
                                ? 'border-gold'
                                : item
                                  ? 'border-ink/50'
                                  : 'border-dashed border-line hover:border-muted'
                          } ${shake ? 'row-shake' : ''} bg-raised`}
                        >
                          {item ? (
                            <ItemImage item={item} className="h-full w-full" />
                          ) : (
                            <span className="text-[12px] text-muted/70">+</span>
                          )}
                          {locked && (
                            <span className="absolute bottom-0 right-0 rounded-tl-[4px] bg-s-green p-[2px] text-[var(--s-ink)]">
                              <LockIcon className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </button>
                      );
                    })
                  : Array.from({ length: BUILD_SIZE }, (_, i) => (
                      <div key={`e-${r}-${i}`} className="aspect-[11/8] min-h-[44px] w-full rounded-[5px] border-2 border-line/40" />
                    ))}
            </div>
          );
        })}
      </div>

      <div className="mt-2 min-h-[44px]" aria-live="polite">
        {playing && selected !== null && state.current[selected] ? (
          <div className="flex items-center gap-2">
            <span className="mr-auto truncate text-sm text-muted">
              Slot {selected + 1}: <span className="text-ink">{items[state.current[selected]!]?.name}</span>
            </span>
            <button type="button" onClick={() => onMove(selected, -1)} disabled={selected === 0} aria-label="Move left" className="flex h-11 w-11 items-center justify-center rounded-md bg-raised disabled:opacity-30">
              <ChevronLeft />
            </button>
            <button type="button" onClick={() => onMove(selected, 1)} disabled={selected === BUILD_SIZE - 1} aria-label="Move right" className="flex h-11 w-11 items-center justify-center rounded-md bg-raised disabled:opacity-30">
              <ChevronRight />
            </button>
            <button
              type="button"
              onClick={() => {
                onClear(selected);
                setSelected(null);
              }}
              className="flex h-11 items-center gap-1 rounded-md bg-raised px-3 text-sm font-semibold"
            >
              <CloseIcon className="h-4 w-4" /> Remove
            </button>
          </div>
        ) : inspectedText ? (
          <p className="text-sm leading-snug text-muted [&_b]:font-semibold [&_b]:text-ink">{inspectedText}</p>
        ) : state.scored.length ? (
          <p className="text-sm text-muted">Tap a tile to see what it means.</p>
        ) : null}
      </div>
    </section>
  );
}
