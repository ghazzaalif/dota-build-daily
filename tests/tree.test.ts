// Item tree (recipes for 🟧) and placing an item from an earlier row into a chosen slot.
import items from '../public/data/items.json';
import { gameReducer, initGame } from '../src/game/game';
import { scoreRow } from '../src/game/scoring';
import { buildsInto, itemsSharing, madeFrom, orangeCandidates } from '../src/game/tree';
import type { ItemsMap } from '../src/game/types';

const I = items as unknown as ItemsMap;

describe('item tree', () => {
  it('lists direct components with counts', () => {
    expect(madeFrom(I, 'bfury')).toEqual([
      { key: 'pers', count: 1 },
      { key: 'broadsword', count: 2 },
      { key: 'quelling_blade', count: 1 },
    ].filter((c) => I[c.key]));
  });

  it('lists the guessable items an item builds into, cheapest first', () => {
    const into = buildsInto(I, 'mithril_hammer');
    expect(into).toContain('black_king_bar');
    expect(into).toContain('desolator');
    expect(into.every((k) => I[k].eligible)).toBe(true);
    const costs = into.map((k) => I[k].cost);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });

  it('🟧 candidates: items sharing the component, minus the guess; tried items marked', () => {
    const answer = ['power_treads', 'black_king_bar', 'manta', 'butterfly', 'satanic', 'skadi'];
    const guess = ['phase_boots', 'desolator', 'cyclone', 'sange_and_yasha', 'greater_crit', 'radiance'];
    const row = scoreRow(I, guess, answer);
    const deso = row[1];
    expect(deso).toMatchObject({ state: 'orange', sharedComponent: 'mithril_hammer' });
    const cands = orangeCandidates(I, deso, [row]);
    const keys = cands.map((c) => c.key);
    expect(keys).toContain('black_king_bar');
    expect(keys).not.toContain('desolator');
    expect(cands.every((c) => c.status === 'open')).toBe(true);
    // Once Maelstrom-family or other sharers are tried and greyed, they're ruled out.
    const row2 = scoreRow(I, ['phase_boots', 'monkey_king_bar', 'cyclone', 'sange_and_yasha', 'greater_crit', 'radiance'], answer, [guess]);
    const after = orangeCandidates(I, deso, [row, row2]);
    if (itemsSharing(I, 'mithril_hammer').includes('monkey_king_bar')) {
      expect(after.find((c) => c.key === 'monkey_king_bar')?.status).toBe('ruled_out');
    }
    expect(orangeCandidates(I, row[0], [row])).toEqual([]); // not orange → no list
  });
});

describe("placing an item into a slot (drag from an earlier row)", () => {
  const answer = ['power_treads', 'black_king_bar', 'manta', 'butterfly', 'satanic', 'skadi'];
  const reduce = gameReducer({ answer, items: I });
  const fresh = () => initGame({ answer, items: I }, null, false);

  it('puts the item in the slot, replacing what was there', () => {
    let s = fresh();
    s = reduce(s, { type: 'add', key: 'desolator' });
    s = reduce(s, { type: 'place', slot: 0, key: 'black_king_bar' });
    expect(s.current[0]).toBe('black_king_bar');
    s = reduce(s, { type: 'place', slot: 3, key: 'manta' });
    expect(s.current).toEqual(['black_king_bar', null, null, 'manta', null, null]);
  });

  it('moving an item already in the row swaps it with the target', () => {
    let s = fresh();
    for (const k of ['manta', 'butterfly']) s = reduce(s, { type: 'add', key: k });
    s = reduce(s, { type: 'place', slot: 1, key: 'manta' });
    expect(s.current.slice(0, 2)).toEqual(['butterfly', 'manta']);
    expect(s.current.filter((k) => k === 'manta')).toHaveLength(1);
  });

  it('ignores locked slots, the lifeline item, ineligible items and finished games', () => {
    let s = fresh();
    s = { ...s, lifeline: { slot: 0, key: 'power_treads' }, current: ['power_treads', null, null, null, null, null] };
    expect(reduce(s, { type: 'place', slot: 0, key: 'manta' }).current[0]).toBe('power_treads');
    expect(reduce(s, { type: 'place', slot: 2, key: 'power_treads' }).current[2]).toBeNull();
    const notEligible = Object.keys(I).find((k) => !I[k].eligible)!;
    expect(reduce(s, { type: 'place', slot: 2, key: notEligible }).current[2]).toBeNull();
    expect(reduce({ ...s, status: 'won' }, { type: 'place', slot: 2, key: 'manta' }).current[2]).toBeNull();
  });
});
