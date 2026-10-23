// Item tree: what an item is made from and what it builds into, so a 🟧 can be reasoned
// about. For a 🟧 tile it opens on the shared component and lists every item the tile
// could be pointing at, with the ones the player's rows already ruled out greyed.
import { useEffect, useMemo, useState } from 'react';
import type { ItemsMap, ScoredTile } from '../game/types';
import { buildsInto, madeFrom, orangeCandidates } from '../game/tree';
import { Coin, CloseIcon, ItemImage } from './Icons';

interface Props {
  items: ItemsMap;
  /** Item to start on. */
  start: string;
  /** The tile tapped, when opened from the grid (enables the 🟧 explanation). */
  tile?: ScoredTile;
  scored: ScoredTile[][];
  inRow: (string | null)[];
  /** Present while playing: adds the focused item to the row. */
  onAdd?: (key: string) => void;
  onClose?: () => void;
  compact?: boolean;
}

function Chip({ items, k, onClick, dim, mark, count }: { items: ItemsMap; k: string; onClick: () => void; dim?: boolean; mark?: string; count?: number }) {
  const item = items[k];
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-label={`${item.name}${count && count > 1 ? ` ×${count}` : ''}${mark ? `, ${mark}` : ''}. Show its tree`}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-[3px] px-1.5 py-1 text-left hover:bg-raised"
      >
        <span className="relative shrink-0">
          <ItemImage item={item} className={`h-[26px] w-[36px] rounded-[2px] ${dim ? 'opacity-35 grayscale' : ''}`} />
          {count && count > 1 && (
            <span className="absolute -bottom-1 -right-1 rounded-[2px] bg-ink px-[3px] text-[10px] font-bold leading-[14px] text-bg">×{count}</span>
          )}
        </span>
        <span className={`min-w-0 flex-1 truncate text-small ${dim ? 'text-muted line-through' : ''}`}>{item.name}</span>
        {mark && <span className="shrink-0 text-meta text-muted">{mark}</span>}
      </button>
    </li>
  );
}

export function ItemTree({ items, start, tile, scored, inRow, onAdd, onClose, compact }: Props) {
  const orange = tile?.state === 'orange' && tile.sharedComponent ? tile : undefined;
  const [focus, setFocus] = useState(orange?.sharedComponent ?? start);
  useEffect(() => setFocus(orange?.sharedComponent ?? start), [start, orange?.sharedComponent]);

  const item = items[focus];
  const parts = useMemo(() => madeFrom(items, focus), [items, focus]);
  const into = useMemo(() => buildsInto(items, focus), [items, focus]);
  const candidates = useMemo(() => (orange ? orangeCandidates(items, orange, scored) : []), [items, orange, scored]);
  const open = candidates.filter((c) => c.status === 'open');
  // 🟧 never points at items found by then, so a found candidate was found later: the likely answer.
  const found = candidates.filter((c) => c.status === 'found');
  if (!item) return null;

  const tried = new Set(scored.flat().filter((t) => t.state === 'grey' || t.state === 'orange').map((t) => t.key));
  const canAdd = onAdd && item.eligible && !inRow.includes(focus);

  return (
    <section aria-label="Item tree" className={`rounded-[4px] border border-line bg-panel ${compact ? 'p-3' : 'p-4'}`}>
      {orange && (
        <p className="mb-3 text-small text-muted [&_b]:font-semibold [&_b]:text-ink">
          <b>{items[orange.key]?.name}</b> shares <b>{items[orange.sharedComponent!]?.name}</b> with an item you haven't found yet.{' '}
          {found.length > 0 && (
            <>
              You've since found <b>{found.map((c) => items[c.key]?.name).join(', ')}</b>, which uses it, so that may be what it meant.{' '}
            </>
          )}
          {open.length ? (
            <>
              {found.length ? 'Otherwise it' : 'It'}'s one of the <b>{open.length}</b> item{open.length === 1 ? '' : 's'} below that you haven't ruled out.
            </>
          ) : found.length ? null : (
            "Every item that uses it has been tried, so recheck the slots you've filled."
          )}
        </p>
      )}

      <div className="flex items-center gap-3">
        <ItemImage item={item} className="h-[44px] w-[60px] shrink-0 rounded-[3px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{item.name}</p>
          <p className="flex items-center gap-1 text-meta tabular-nums text-gold">
            <Coin /> {item.cost.toLocaleString('en-US')}
            {!item.eligible && <span className="ml-1 text-muted">· component, not a final item</span>}
          </p>
        </div>
        {canAdd && (
          <button type="button" onClick={() => onAdd(focus)} className="h-11 shrink-0 rounded-[3px] bg-ink px-3 text-small font-bold text-bg">
            Add to row
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close item tree" className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center text-muted hover:text-ink">
            <CloseIcon />
          </button>
        )}
      </div>

      {orange && candidates.length > 0 && focus === orange.sharedComponent && (
        <div className="mt-3">
          <h3 className="mb-1 text-label font-semibold text-muted">Items that use {items[orange.sharedComponent!]?.name}</h3>
          <ul className="grid grid-cols-2 gap-x-1">
            {candidates.map((c) => (
              <Chip
                key={c.key}
                items={items}
                k={c.key}
                onClick={() => setFocus(c.key)}
                dim={c.status === 'ruled_out'}
                mark={c.status === 'ruled_out' ? 'tried' : c.status === 'found' ? 'found ✓' : undefined}
              />
            ))}
          </ul>
        </div>
      )}

      {parts.length > 0 && (
        <div className="mt-3">
          <h3 className="mb-1 text-label font-semibold text-muted">Made from</h3>
          <ul className="grid grid-cols-2 gap-x-1">
            {parts.map((c) => (
              <Chip key={c.key} items={items} k={c.key} count={c.count} onClick={() => setFocus(c.key)} />
            ))}
          </ul>
        </div>
      )}

      {into.length > 0 && !(orange && focus === orange.sharedComponent) && (
        <div className="mt-3">
          <h3 className="mb-1 text-label font-semibold text-muted">Builds into</h3>
          <ul className="grid grid-cols-2 gap-x-1">
            {into.map((k) => (
              <Chip key={k} items={items} k={k} onClick={() => setFocus(k)} dim={tried.has(k)} mark={tried.has(k) ? 'tried' : undefined} />
            ))}
          </ul>
        </div>
      )}

      {!parts.length && !into.length && !orange && <p className="mt-3 text-small text-muted">No recipe: this item is bought whole and doesn't build into anything.</p>}

      {focus !== (orange?.sharedComponent ?? start) && (
        <button type="button" onClick={() => setFocus(orange?.sharedComponent ?? start)} className="mt-2 h-11 text-small font-semibold text-muted hover:text-ink">
          ← Back to {items[orange?.sharedComponent ?? start]?.name}
        </button>
      )}
    </section>
  );
}
