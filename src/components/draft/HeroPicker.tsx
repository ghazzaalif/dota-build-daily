// Draft F4 hero picker — replaces Wordle's keyboard. Grouped by typical position (default)
// or primary attribute; searchable by name and nickname; shaded by best known state.
// Banned and enemy heroes stay visible but greyed out and disabled, like the in-game screen.
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { buildHeroIndex, searchHeroes, type HeroEntry } from '../../game/draft/search';
import type { DraftTileState } from '../../game/draft/types';
import type { HeroAttr, HeroesMap } from '../../game/types';
import { CloseIcon, HeroImage, SearchIcon } from '../Icons';
import { ATTR_CLASS, DRAFT_SYMBOL } from './DraftGrid';

const BADGE: Record<DraftTileState, string> = { green: 'bg-s-green', yellow: 'bg-s-yellow', grey: 'bg-s-grey' };

const POS_GROUPS: { id: string; label: string; pos: number[] }[] = [
  { id: 'carry', label: 'Carry', pos: [1] },
  { id: 'mid', label: 'Mid', pos: [2] },
  { id: 'off', label: 'Offlane', pos: [3] },
  { id: 'sup', label: 'Support', pos: [4, 5] },
];
const ATTR_GROUPS: { id: HeroAttr; label: string }[] = [
  { id: 'str', label: 'Strength' },
  { id: 'agi', label: 'Agility' },
  { id: 'int', label: 'Intelligence' },
  { id: 'all', label: 'Universal' },
];

interface Props {
  heroes: HeroesMap;
  best: Record<number, DraftTileState>;
  /** Hero → why it can't be picked. */
  blocked: Map<number, 'Banned' | 'Enemy pick'>;
  inRow: (number | null)[];
  onAdd: (heroId: number) => void;
  onBackspace: () => void;
  onSubmit: () => void;
  rowFull: boolean;
  onClose?: () => void;
  autoFocus?: boolean;
  columns: number;
}

export function HeroPicker(p: Props) {
  const index = useMemo(() => buildHeroIndex(p.heroes), [p.heroes]);
  const [query, setQuery] = useState('');
  const [groupBy, setGroupBy] = useState<'pos' | 'attr'>('pos');
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => (query.trim() ? searchHeroes(index, query) : []), [index, query]);
  const groups = useMemo(() => {
    const byName = (a: HeroEntry, b: HeroEntry) => a.hero.name.localeCompare(b.hero.name);
    if (groupBy === 'attr') return ATTR_GROUPS.map((g) => ({ ...g, entries: index.filter((e) => (e.hero.attr ?? 'all') === g.id).sort(byName) }));
    return POS_GROUPS.map((g) => ({ ...g, entries: index.filter((e) => g.pos.includes(e.hero.typicalPos ?? 3)).sort(byName) }));
  }, [index, groupBy]);

  const add = (id: number) => {
    p.onAdd(id);
    if (query) {
      setQuery('');
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if ((e.metaKey || e.ctrlKey || !query.trim()) && p.rowFull) return p.onSubmit();
      const first = results.find((r) => !p.inRow.includes(r.hero.id) && !p.blocked.has(r.hero.id));
      if (first) add(first.hero.id);
    } else if (e.key === 'Backspace' && !query) {
      p.onBackspace();
    } else if (e.key === 'Escape') {
      if (query) setQuery('');
      else p.onClose?.();
    }
  };

  const renderHero = ({ hero }: HeroEntry) => {
    const state = p.best[hero.id];
    const used = p.inRow.includes(hero.id);
    const blocked = p.blocked.get(hero.id);
    const disabled = used || !!blocked;
    const note = blocked ?? (used ? 'In row' : null);
    return (
      <li key={hero.id}>
        <button
          type="button"
          onClick={() => add(hero.id)}
          disabled={disabled}
          aria-label={`${hero.name}${state ? `, ${state === 'grey' ? 'not in the team' : state}` : ''}${note ? `, ${note.toLowerCase()}` : ''}`}
          className="group flex w-full flex-col gap-1 rounded-[3px] p-1 text-left hover:bg-raised disabled:cursor-default disabled:hover:bg-transparent"
        >
          <span className="relative block">
            <HeroImage
              hero={hero}
              className={`aspect-[16/9] w-full rounded-[2px] ${blocked ? 'opacity-25 grayscale' : used ? 'opacity-30' : state === 'grey' ? 'opacity-40 grayscale' : ''}`}
            />
            {state && !blocked && (
              <span aria-hidden="true" className={`absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center text-[11px] font-bold text-[var(--s-ink)] ${BADGE[state]}`}>
                {DRAFT_SYMBOL[state]}
              </span>
            )}
            {blocked && (
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 bg-black/70 py-px text-center text-[10px] font-bold uppercase tracking-[0.04em] text-white">
                {blocked === 'Banned' ? 'Banned' : 'Enemy'}
              </span>
            )}
          </span>
          <span className={`block truncate text-label font-medium leading-4 ${disabled || state === 'grey' ? 'text-muted' : ''}`}>
            {used && !blocked ? 'In row' : hero.name}
          </span>
        </button>
      </li>
    );
  };

  const gridStyle = { gridTemplateColumns: `repeat(${p.columns}, minmax(0, 1fr))` };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <h2 className="sr-only">Hero picker</h2>
      <div className="flex items-center gap-2 px-3 pt-3">
        <label className="relative flex-1">
          <span className="sr-only">Search heroes</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            autoFocus={p.autoFocus}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search: am, sf, qop, cm…"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            className="h-11 w-full rounded-[3px] bg-raised pl-9 pr-3 text-body text-ink placeholder:text-muted focus:outline focus:outline-2 focus:outline-ink"
          />
        </label>
        {p.onClose && (
          <button type="button" onClick={p.onClose} aria-label="Close hero picker" className="flex h-11 w-11 items-center justify-center rounded-[3px] bg-raised">
            <CloseIcon />
          </button>
        )}
      </div>

      {!query.trim() && (
        <div className="mt-2 flex items-center gap-2 border-b border-line px-3 pb-2" role="radiogroup" aria-label="Group heroes by">
          <span className="text-label text-muted">Group by</span>
          {(
            [
              ['pos', 'Position'],
              ['attr', 'Attribute'],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={groupBy === v}
              onClick={() => setGroupBy(v)}
              className={`h-9 rounded-[3px] px-3 text-label font-semibold ${groupBy === v ? 'bg-ink text-bg' : 'bg-raised text-muted hover:text-ink'}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-4 pt-1">
        {query.trim() ? (
          results.length ? (
            <ul className="grid gap-x-1 gap-y-1" style={gridStyle}>
              {results.map(renderHero)}
            </ul>
          ) : (
            <p className="px-2 py-6 text-small text-muted">No hero matches “{query}”. Try a nickname like “am” or “qop”.</p>
          )
        ) : (
          groups.map((g) => (
            <section key={g.id} aria-label={g.label} className="mb-2">
              <h3 className={`px-1.5 pb-1 pt-3 text-label font-semibold ${groupBy === 'attr' ? ATTR_CLASS[g.id as HeroAttr] : 'text-muted'}`}>
                {g.label} <span className="font-normal text-muted">· {g.entries.length}</span>
              </h3>
              <ul className="grid gap-x-1 gap-y-1" style={gridStyle}>
                {g.entries.map(renderHero)}
              </ul>
            </section>
          ))
        )}
      </div>
      {groupBy === 'pos' && !query.trim() && (
        <p className="border-t border-line px-3 py-2 text-meta text-muted">Grouped by each hero's most common pro position this patch. Flex picks can go anywhere.</p>
      )}
    </div>
  );
}
