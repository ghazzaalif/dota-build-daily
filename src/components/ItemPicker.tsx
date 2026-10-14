// F4 item picker — replaces Wordle's keyboard. Eligible items only, grouped by shop tab,
// searchable by name and alias, shaded by best known state.
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { buildIndex, searchItems } from '../game/search';
import type { Category, ItemsMap, TileState } from '../game/types';
import { SYMBOL } from './Grid';
import { CloseIcon, Coin, ItemImage, SearchIcon } from './Icons';

export const CATEGORY_ORDER: { id: Category; label: string }[] = [
  { id: 'boots', label: 'Boots' },
  { id: 'accessories', label: 'Accessories' },
  { id: 'support', label: 'Support' },
  { id: 'magical', label: 'Magical' },
  { id: 'armor', label: 'Armor' },
  { id: 'weapons', label: 'Weapons' },
  { id: 'artifacts', label: 'Artifacts' },
];

const BADGE: Record<TileState, string> = {
  green: 'bg-s-green',
  yellow: 'bg-s-yellow',
  orange: 'bg-s-orange',
  grey: 'bg-s-grey',
};

interface Props {
  items: ItemsMap;
  best: Record<string, TileState>;
  inRow: (string | null)[];
  onAdd: (key: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
  rowFull: boolean;
  onClose?: () => void;
  autoFocus?: boolean;
}

export function ItemPicker({ items, best, inRow, onAdd, onBackspace, onSubmit, rowFull, onClose, autoFocus }: Props) {
  const index = useMemo(() => buildIndex(items), [items]);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<Category | 'all'>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => (query.trim() ? searchItems(index, query) : []), [index, query]);
  const groups = useMemo(() => {
    const byCat = new Map<Category, typeof index>();
    for (const e of index) {
      const list = byCat.get(e.item.category) ?? [];
      list.push(e);
      byCat.set(e.item.category, list);
    }
    for (const list of byCat.values()) list.sort((a, b) => a.item.cost - b.item.cost || a.item.name.localeCompare(b.item.name));
    return CATEGORY_ORDER.filter((c) => cat === 'all' || c.id === cat).map((c) => ({ ...c, entries: byCat.get(c.id) ?? [] }));
  }, [index, cat]);

  const add = (key: string) => {
    onAdd(key);
    if (query) {
      setQuery('');
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if ((e.metaKey || e.ctrlKey || !query.trim()) && rowFull) return onSubmit();
      const first = results.find((r) => !inRow.includes(r.key));
      if (first) add(first.key);
    } else if (e.key === 'Backspace' && !query) {
      onBackspace();
    } else if (e.key === 'Escape') {
      if (query) setQuery('');
      else onClose?.();
    }
  };

  const renderItem = (key: string) => {
    const item = items[key];
    const state = best[key];
    const used = inRow.includes(key);
    return (
      <li key={key}>
        <button
          type="button"
          onClick={() => add(key)}
          disabled={used}
          aria-label={`${item.name}, ${item.cost} gold${state ? `, ${state === 'grey' ? 'not in build' : state}` : ''}${used ? ', in row' : ''}`}
          className={`group flex min-h-[44px] w-full items-center gap-2 rounded-md p-1 pr-2 text-left hover:bg-raised disabled:cursor-default disabled:hover:bg-transparent ${
            state === 'grey' && !used ? 'opacity-45' : ''
          }`}
        >
          <span className="relative shrink-0">
            <ItemImage item={item} className={`h-[29px] w-[40px] rounded-[3px] ${used ? 'opacity-30' : ''}`} />
            {state && (
              <span aria-hidden="true" className={`absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-[var(--s-ink)] ${BADGE[state]}`}>
                {SYMBOL[state]}
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-[14px] font-medium leading-tight ${used ? 'text-muted' : ''}`}>{item.name}</span>
            <span className="flex items-center gap-1 text-[12px] leading-tight text-gold tabular-nums">
              {used ? (
                <span className="text-muted">In row</span>
              ) : (
                <>
                  <Coin /> {item.cost.toLocaleString('en-US')}
                </>
              )}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 pt-3">
        <label className="relative flex-1">
          <span className="sr-only">Search items</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            autoFocus={autoFocus}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search: bkb, aghs, manta…"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            className="h-11 w-full rounded-md border border-line bg-bg pl-9 pr-3 text-[16px] text-ink placeholder:text-muted/70 focus:border-gold focus:outline-none"
          />
        </label>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close item shop" className="flex h-11 w-11 items-center justify-center rounded-md bg-raised">
            <CloseIcon />
          </button>
        )}
      </div>

      {!query.trim() && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-1 pt-2" role="tablist" aria-label="Shop categories">
          {[{ id: 'all' as const, label: 'All' }, ...CATEGORY_ORDER].map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={cat === c.id}
              onClick={() => setCat(c.id)}
              className={`h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold ${cat === c.id ? 'bg-ink text-bg' : 'bg-raised text-muted hover:text-ink'}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4 pt-1">
        {query.trim() ? (
          results.length ? (
            <ul className="grid grid-cols-2 gap-x-1 lg:grid-cols-2">{results.map((r) => renderItem(r.key))}</ul>
          ) : (
            <p className="px-2 py-6 text-sm text-muted">No item matches “{query}”. Try a short name like “bkb” or “deso”.</p>
          )
        ) : (
          groups.map((g) => (
            <section key={g.id} aria-label={g.label} className="mb-2">
              {cat === 'all' && <h3 className="px-2 pb-1 pt-2 text-[13px] font-semibold text-muted">{g.label}</h3>}
              <ul className="grid grid-cols-2 gap-x-1">{g.entries.map((e) => renderItem(e.key))}</ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
