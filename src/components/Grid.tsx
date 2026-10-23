// F3 guess grid: 6 rows × 6 slots. Tiles use the item icon's own 11:8 shape so
// each row reads like a purchase timeline.
//
// Tiles can be dragged (mouse, or press-and-hold on touch) from any earlier row into the
// row being built, and between slots of that row. Tapping a guessed tile opens its item
// tree, which explains 🟧 and can add the item to the row too (the keyboard path).
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as RPointerEvent, type TouchEvent as RTouchEvent } from 'react';
import { BUILD_SIZE, MAX_ROWS } from '../config';
import type { GameState } from '../game/game';
import type { ItemsMap, ScoredTile, TileState } from '../game/types';
import { ChevronLeft, ChevronRight, CloseIcon, ItemImage, LockIcon } from './Icons';
import { ItemTree } from './ItemTree';

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

/** Shared tile box: the item icon's own 11:8 shape, squared like a broadcast graphic. */
const TILE = 'relative flex aspect-[11/8] min-h-[44px] w-full overflow-hidden rounded-[3px] [-webkit-touch-callout:none]';

const HOLD_MS = 250; // touch: hold this long before a drag starts, so the page still scrolls
const SLOP = 8;

interface Props {
  state: GameState;
  items: ItemsMap;
  animateLastRow: boolean;
  onSlotTap: (slot: number) => void;
  onSwap: (from: number, to: number) => void;
  onPlace: (slot: number, key: string) => void;
  onAddItem: (key: string) => void;
  onMove: (slot: number, dir: -1 | 1) => void;
  onClear: (slot: number) => void;
  selected: number | null;
  setSelected: (s: number | null) => void;
}

interface DragSource {
  key: string;
  /** Set when dragging a slot of the row being built (a move); null for an earlier row (a copy). */
  fromSlot: number | null;
}

interface DragState {
  src: DragSource;
  x: number;
  y: number;
  over: number | null;
}

function slotAt(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y)?.closest('[data-drop-slot]');
  return el ? Number(el.getAttribute('data-drop-slot')) : null;
}

/** Pointer-based drag that works for mouse and touch (HTML5 drag-and-drop doesn't on phones). */
function useTileDrag(enabled: boolean, onDrop: (src: DragSource, slot: number) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const set = (d: DragState | null) => {
    dragRef.current = d;
    setDrag(d);
  };
  const end = (x?: number, y?: number) => {
    const d = dragRef.current;
    cleanup.current?.();
    cleanup.current = null;
    if (!d) return;
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
    const slot = x === undefined ? null : slotAt(x, y!);
    set(null);
    if (slot !== null) onDropRef.current(d.src, slot);
  };
  useEffect(() => () => cleanup.current?.(), []);
  useEffect(() => {
    if (!enabled) end();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const begin = (src: DragSource, x: number, y: number) => {
    set({ src, x, y, over: slotAt(x, y) });
    navigator.vibrate?.(8);
  };
  const moveTo = (x: number, y: number) => {
    const d = dragRef.current;
    if (d) set({ ...d, x, y, over: slotAt(x, y) });
  };

  const onMouseDown = (src: DragSource) => (e: RPointerEvent) => {
    if (!enabled || e.pointerType !== 'mouse' || e.button !== 0) return;
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev: PointerEvent) => {
      if (!dragRef.current && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) begin(src, ev.clientX, ev.clientY);
      else moveTo(ev.clientX, ev.clientY);
    };
    const up = (ev: PointerEvent) => end(ev.clientX, ev.clientY);
    const cancel = () => end();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    cleanup.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  };

  const onTouchStart = (src: DragSource) => (e: RTouchEvent) => {
    if (!enabled || e.touches.length !== 1) return;
    const t = e.touches[0];
    const sx = t.clientX;
    const sy = t.clientY;
    let last = { x: sx, y: sy };
    const timer = window.setTimeout(() => begin(src, last.x, last.y), HOLD_MS);
    // Non-passive so a started drag can stop the page from scrolling under the finger.
    const move = (ev: TouchEvent) => {
      const p = ev.touches[0];
      last = { x: p.clientX, y: p.clientY };
      if (dragRef.current) {
        ev.preventDefault();
        moveTo(p.clientX, p.clientY);
      } else if (Math.hypot(p.clientX - sx, p.clientY - sy) > SLOP) {
        clearTimeout(timer); // it's a scroll
        cleanup.current?.();
        cleanup.current = null;
      }
    };
    const up = () => {
      clearTimeout(timer);
      end(last.x, last.y);
    };
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    window.addEventListener('touchcancel', up);
    cleanup.current = () => {
      clearTimeout(timer);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
      window.removeEventListener('touchcancel', up);
    };
  };

  const handlers = (src: DragSource | null) =>
    src && enabled
      ? {
          onPointerDown: onMouseDown(src),
          onTouchStart: onTouchStart(src),
          onContextMenu: (e: MouseEvent) => e.preventDefault(),
        }
      : {};

  /** Wrap click handlers so the click that ends a drag doesn't also tap the tile. */
  const click = (fn: () => void) => () => {
    if (!suppressClick.current) fn();
  };

  return { drag, handlers, click };
}

function ScoredTileView({ tile, items, delay, animate, onInspect, active, dragProps }: {
  tile: ScoredTile;
  items: ItemsMap;
  delay: number;
  animate: boolean;
  onInspect: () => void;
  active: boolean;
  dragProps: object;
}) {
  const item = items[tile.key];
  const shared = tile.sharedComponent ? items[tile.sharedComponent]?.name : undefined;
  const [revealed, setRevealed] = useState(!animate);
  useEffect(() => {
    if (!animate) return;
    const t = setTimeout(() => setRevealed(true), delay + 250);
    return () => clearTimeout(t);
  }, [animate, delay]);

  const label = `${item?.name ?? tile.key}, ${STATE_TEXT[tile.state]}${shared ? ` (${shared})` : ''}. Show item tree`;
  return (
    <button
      type="button"
      onClick={onInspect}
      {...dragProps}
      title={tile.state === 'orange' && shared ? `Shares ${shared} with an item you haven't found yet` : label}
      aria-label={label}
      aria-expanded={active}
      className={`${TILE} flex-col border-[3px] ${revealed ? STATE_CLASS[tile.state] : 'border-line bg-raised'} ${
        animate ? 'tile-flip' : ''
      } ${active ? 'ring-2 ring-ink ring-offset-2 ring-offset-bg' : ''}`}
      style={animate ? { animationDelay: `${delay}ms` } : undefined}
    >
      {item && <ItemImage item={item} className={`h-full w-full ${revealed && tile.state === 'grey' ? 'opacity-35 grayscale' : ''}`} />}
      {revealed && (
        <span
          aria-hidden="true"
          className={`absolute bottom-0 right-0 flex h-4 min-w-4 items-center justify-center px-[3px] text-meta font-bold leading-none text-[var(--s-ink)] ${STATE_CLASS[tile.state]}`}
        >
          {SYMBOL[tile.state]}
        </span>
      )}
    </button>
  );
}

export function Grid({ state, items, animateLastRow, onSlotTap, onSwap, onPlace, onAddItem, onMove, onClear, selected, setSelected }: Props) {
  const [inspect, setInspect] = useState<{ row: number; slot: number } | null>(null);
  const [shake, setShake] = useState(0);
  const playing = state.status === 'in_progress';
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

  useEffect(() => {
    if (state.error) setShake((n) => n + 1);
  }, [state.error]);
  useEffect(() => setInspect(null), [state.rows.length]);

  const { drag, handlers, click } = useTileDrag(playing, (src, slot) => {
    if (src.fromSlot !== null) onSwap(src.fromSlot, slot);
    else onPlace(slot, src.key);
  });

  const inspected = inspect ? state.scored[inspect.row]?.[inspect.slot] : null;
  const lastRow = state.rows.length - 1;
  const currentIndex = playing ? state.rows.length : -1;

  // The tree's "Add to row" fills the selected slot if there is one, otherwise the next free slot.
  const addFromTree = (key: string) => {
    if (selected !== null && state.lifeline?.slot !== selected) {
      onPlace(selected, key);
      setSelected(null);
    } else onAddItem(key);
  };

  return (
    <section aria-labelledby="guesses-heading" className="select-none">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="guesses-heading" className="text-lead font-semibold">
          Final items
        </h2>
        <p className="text-label text-muted">Slot 1 was bought first</p>
      </div>
      <div className="grid grid-cols-[1.25rem_repeat(6,minmax(0,1fr))] gap-x-1.5 gap-y-1.5">
        <span />
        {Array.from({ length: BUILD_SIZE }, (_, i) => (
          <span key={i} aria-hidden="true" className="text-center font-display text-lead font-bold tabular-nums text-muted">
            {i + 1}
          </span>
        ))}

        {Array.from({ length: MAX_ROWS }, (_, r) => {
          const isCurrent = r === currentIndex;
          const scored = state.scored[r];
          return (
            <div key={r} role="group" aria-label={`Guess ${r + 1}`} className="contents">
              <span
                aria-hidden="true"
                className={`flex items-center justify-center font-display text-body font-bold tabular-nums ${isCurrent ? 'text-ink' : 'text-muted'}`}
              >
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
                      dragProps={handlers(playing && items[t.key]?.eligible ? { key: t.key, fromSlot: null } : null)}
                      onInspect={click(() => setInspect(inspect?.row === r && inspect.slot === i ? null : { row: r, slot: i }))}
                    />
                  ))
                : isCurrent
                  ? state.current.map((key, i) => {
                      const item = key ? items[key] : undefined;
                      const locked = state.lifeline?.slot === i;
                      const isSel = selected === i;
                      const isOver = drag?.over === i && !locked;
                      return (
                        <button
                          key={`cur-${i}-${shake}`}
                          type="button"
                          data-drop-slot={i}
                          {...handlers(key && !locked ? { key, fromSlot: i } : null)}
                          onClick={click(() => onSlotTap(i))}
                          aria-label={
                            item
                              ? `Slot ${i + 1}: ${item.name}${locked ? ', locked by lifeline' : ''}. Tap to select`
                              : `Slot ${i + 1}: empty. Tap to pick an item`
                          }
                          aria-pressed={isSel}
                          className={`${TILE} items-center justify-center border-[3px] transition-colors duration-150 ${
                            locked
                              ? 'border-s-green'
                              : isOver
                                ? 'border-ink bg-panel'
                                : isSel
                                  ? 'border-ink'
                                  : item
                                    ? 'border-raised'
                                    : 'border-dashed border-faint hover:border-muted'
                          } ${shake ? 'row-shake' : ''} ${isOver ? '' : 'bg-raised'} ${drag?.src.fromSlot === i ? 'opacity-40' : ''}`}
                        >
                          {item ? (
                            <ItemImage item={item} className="h-full w-full" />
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
                  : Array.from({ length: BUILD_SIZE }, (_, i) => (
                      <div key={`e-${r}-${i}`} className="aspect-[11/8] min-h-[44px] w-full rounded-[3px] bg-raised/50" />
                    ))}
            </div>
          );
        })}
      </div>

      <div className="mt-2 min-h-[44px]" aria-live="polite">
        {playing && selected !== null && state.current[selected] ? (
          <div className="flex items-center gap-2">
            <span className="mr-auto truncate text-small text-muted">
              Slot {selected + 1}: <span className="font-semibold text-ink">{items[state.current[selected]!]?.name}</span>
            </span>
            <button type="button" onClick={() => onMove(selected, -1)} disabled={selected === 0} aria-label="Move left" className="flex h-11 w-11 items-center justify-center rounded-[3px] bg-raised disabled:opacity-30">
              <ChevronLeft />
            </button>
            <button type="button" onClick={() => onMove(selected, 1)} disabled={selected === BUILD_SIZE - 1} aria-label="Move right" className="flex h-11 w-11 items-center justify-center rounded-[3px] bg-raised disabled:opacity-30">
              <ChevronRight />
            </button>
            <button
              type="button"
              onClick={() => {
                onClear(selected);
                setSelected(null);
              }}
              className="flex h-11 items-center gap-1 rounded-[3px] bg-raised px-3 text-small font-semibold"
            >
              <CloseIcon className="h-4 w-4" /> Remove
            </button>
          </div>
        ) : !inspected && state.scored.length ? (
          <p className="text-small text-muted">
            {playing
              ? `Tap a tile for its item tree. ${touch ? 'Press and hold a tile' : 'Drag a tile'} to move it into your row.`
              : 'Tap a tile for its item tree.'}
          </p>
        ) : null}
        {inspected && (
          <div className="mt-1">
            <ItemTree
              compact
              items={items}
              start={inspected.key}
              tile={inspected}
              scored={state.scored}
              inRow={state.current}
              onAdd={playing ? addFromTree : undefined}
              onClose={() => setInspect(null)}
            />
          </div>
        )}
      </div>

      {drag && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 aspect-[11/8] w-[72px] -translate-x-1/2 -translate-y-[70%] overflow-hidden rounded-[3px] shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-2 ring-ink"
          style={{ left: drag.x, top: drag.y }}
        >
          {items[drag.src.key] && <ItemImage item={items[drag.src.key]} className="h-full w-full" />}
        </div>
      )}
    </section>
  );
}
