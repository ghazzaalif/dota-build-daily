import items from '../public/data/items.json';
import { decodeAnswer, encodeAnswer } from '../src/game/answer';
import { addDays, msUntilNextReset, puzzleDateAt, puzzleNumber } from '../src/game/date';
import { gameReducer, initGame, type GameState } from '../src/game/game';
import { formatBand, priceBand, unlockedLevel } from '../src/game/hints';
import { buildIndex, searchItems } from '../src/game/search';
import { buildShareText } from '../src/game/share';
import { displayStreak, emptyStats, recordResult } from '../src/game/storage';
import type { ItemsMap } from '../src/game/types';
import rules from '../data/item-rules.json';

const I = items as unknown as ItemsMap;
const ANSWER = ['power_treads', 'bfury', 'manta', 'black_king_bar', 'butterfly', 'abyssal_blade'];

describe('share text (F7)', () => {
  it('matches the PRD format byte for byte', () => {
    const text = buildShareText({
      puzzleNo: 42,
      heroName: 'Anti-Mage',
      roleLabel: 'Carry',
      won: true,
      hintsUsed: 2,
      url: 'https://<domain>',
      rows: [
        ['yellow', 'grey', 'grey', 'orange', 'grey', 'grey'],
        ['green', 'yellow', 'grey', 'yellow', 'grey', 'grey'],
        ['green', 'green', 'yellow', 'green', 'orange', 'grey'],
        ['green', 'green', 'green', 'green', 'green', 'green'],
      ],
    });
    expect(text).toBe(
      'Dota Build Daily #42 — Anti-Mage (Carry)\n4/6 💡2\n🟨⬛⬛🟧⬛⬛\n🟩🟨⬛🟨⬛⬛\n🟩🟩🟨🟩🟧⬛\n🟩🟩🟩🟩🟩🟩\nhttps://<domain>',
    );
  });

  it('a loss shows X/6, colorblind swaps emoji, and no item names leak', () => {
    const rows = Array(6).fill(['green', 'yellow', 'orange', 'grey', 'grey', 'grey']);
    const text = buildShareText({ puzzleNo: 1, heroName: 'Axe', roleLabel: 'Offlane', won: false, hintsUsed: 0, rows, colorblind: true });
    expect(text.split('\n')[1]).toBe('X/6 💡0');
    expect(text).toContain('🟦🟧🟪⬛⬛⬛');
    for (const k of ANSWER) expect(text.toLowerCase()).not.toContain(I[k].name.toLowerCase());
  });
});

describe('answer obfuscation', () => {
  it('round-trips and is not plain text', () => {
    const entries = ANSWER.map((key, i) => ({ key, timeSec: i * 300 }));
    const enc = encodeAnswer(entries, 'dbd:2026-10-14:1');
    expect(enc).not.toContain('power_treads');
    expect(decodeAnswer(enc, 'dbd:2026-10-14:1')).toEqual(entries);
  });
});

describe('dates (F1)', () => {
  it('uses the UTC date; 06:59 WIB is still the previous puzzle', () => {
    expect(puzzleDateAt(new Date('2026-10-14T23:59:00Z'))).toBe('2026-10-14');
    expect(puzzleDateAt(new Date('2026-10-15T00:00:00Z'))).toBe('2026-10-15');
  });
  it('puzzle number counts from launch', () => {
    expect(puzzleNumber('2026-10-14')).toBe(1);
    expect(puzzleNumber(addDays('2026-10-14', 41))).toBe(42);
  });
  it('countdown to the next reset', () => {
    expect(msUntilNextReset(new Date('2026-10-14T23:00:00Z'))).toBe(3_600_000);
  });
});

describe('stats & streaks (F8)', () => {
  it('streak grows on consecutive wins and breaks on a skipped day or a loss', () => {
    let s = emptyStats();
    s = recordResult(s, '2026-10-14', true, 4);
    s = recordResult(s, '2026-10-15', true, 3);
    expect(s.curStreak).toBe(2);
    s = recordResult(s, '2026-10-17', true, 5); // skipped the 16th
    expect(s.curStreak).toBe(1);
    s = recordResult(s, '2026-10-18', false, 6);
    expect(s.curStreak).toBe(0);
    expect(s.maxStreak).toBe(2);
    expect(s.dist).toMatchObject({ '3': 1, '4': 1, '5': 1, X: 1 });
    expect(s.played).toBe(4);
  });
  it('is idempotent for the same date', () => {
    const s = recordResult(emptyStats(), '2026-10-14', true, 2);
    expect(recordResult(s, '2026-10-14', true, 2)).toBe(s);
  });
  it('shows a broken streak once a day is skipped', () => {
    const s = recordResult(emptyStats(), '2026-10-14', true, 2);
    expect(displayStreak(s, '2026-10-15')).toBe(1);
    expect(displayStreak(s, '2026-10-16')).toBe(0);
  });
});

describe('hints (§5.4)', () => {
  it('unlocks one per wrong row, early reveals stack, and everything shows at the end', () => {
    expect(unlockedLevel(0, 0, false)).toBe(0);
    expect(unlockedLevel(2, 0, false)).toBe(2);
    expect(unlockedLevel(1, 3, false)).toBe(3);
    expect(unlockedLevel(5, 0, false)).toBe(5);
    expect(unlockedLevel(1, 0, true)).toBe(5);
  });
  it('price bands', () => {
    expect(priceBand(1400)).toBe('0-2000');
    expect(priceBand(4050)).toBe('3500-4500');
    expect(priceBand(6250)).toBe('5500+');
    expect(formatBand('3500-4500')).toBe('3,500–4,500 gold');
    expect(formatBand('0-2000')).toBe('Under 2,000 gold');
  });
});

describe('item search (F4)', () => {
  const index = buildIndex(I);
  it('every alias in item-rules.json returns its item within 50 ms', () => {
    const t0 = performance.now();
    for (const [key, aliases] of Object.entries(rules.aliases)) {
      if (!I[key]?.eligible) continue;
      for (const a of aliases) {
        const res = searchItems(index, a).slice(0, 8).map((r) => r.key);
        expect(res, `alias "${a}" → ${key}`).toContain(key);
      }
    }
    const perQuery = (performance.now() - t0) / Object.values(rules.aliases).flat().length;
    expect(perQuery).toBeLessThan(50);
  });
  it('PRD examples rank first', () => {
    expect(searchItems(index, 'bkb')[0].key).toBe('black_king_bar');
    expect(searchItems(index, 'aghs')[0].key).toBe('ultimate_scepter');
    expect(searchItems(index, 'bf')[0].key).toBe('bfury');
    expect(searchItems(index, 'deso')[0].key).toBe('desolator');
    expect(searchItems(index, 'mant')[0].key).toBe('manta');
  });
  it('fuzzy matches typos-by-omission', () => {
    expect(searchItems(index, 'butrfly').map((r) => r.key)).toContain('butterfly');
  });
  it('never lists ineligible items', () => {
    expect(searchItems(index, 'wand').map((r) => r.key)).not.toContain('magic_wand');
    expect(searchItems(index, 'boots of speed').map((r) => r.key)).not.toContain('boots');
  });
});

describe('game reducer (§5)', () => {
  const ctx = { answer: ANSWER, items: I };
  const reduce = gameReducer(ctx);
  const play = (s: GameState, keys: string[]) => {
    s = reduce(s, { type: 'clearAll' });
    for (const k of keys) s = reduce(s, { type: 'add', key: k });
    return reduce(s, { type: 'submit' });
  };
  const fresh = (keepGreens = true) => initGame(ctx, null, keepGreens);
  const WRONG = ['phase_boots', 'desolator', 'cyclone', 'sange_and_yasha', 'greater_crit', 'radiance'];

  it('rejects incomplete rows, duplicates and repeated rows', () => {
    let s = fresh();
    s = reduce(s, { type: 'add', key: 'bfury' });
    s = reduce(s, { type: 'submit' });
    expect(s.error).toMatch(/Fill all/);
    s = reduce(s, { type: 'add', key: 'bfury' });
    expect(s.current.filter((k) => k === 'bfury')).toHaveLength(1);
    s = play(s, WRONG);
    expect(s.rows).toHaveLength(1);
    s = play(s, WRONG);
    expect(s.error).toMatch(/already tried/);
    expect(s.rows).toHaveLength(1);
  });

  it('wins on an all-green row', () => {
    const s = play(fresh(), ANSWER);
    expect(s.status).toBe('won');
  });

  it('keeps greens in the next row, and can be turned off', () => {
    const guess = ['power_treads', 'desolator', 'cyclone', 'sange_and_yasha', 'greater_crit', 'radiance'];
    expect(play(fresh(true), guess).current).toEqual(['power_treads', null, null, null, null, null]);
    expect(play(fresh(false), guess).current).toEqual([null, null, null, null, null, null]);
  });

  it('unlocks hints per row and locks the lifeline after row 5; loses after row 6', () => {
    let s = fresh(false);
    const rows = [
      WRONG,
      ['arcane_boots', 'desolator', 'cyclone', 'sange_and_yasha', 'greater_crit', 'radiance'],
      ['tranquil_boots', 'desolator', 'cyclone', 'sange_and_yasha', 'greater_crit', 'radiance'],
      ['travel_boots', 'desolator', 'cyclone', 'sange_and_yasha', 'greater_crit', 'radiance'],
      ['guardian_greaves', 'desolator', 'cyclone', 'sange_and_yasha', 'greater_crit', 'radiance'],
    ];
    rows.forEach((r, i) => {
      s = play(s, r);
      expect(s.hintsRevealed).toBe(i + 1);
    });
    expect(s.lifeline).toEqual({ slot: 0, key: 'power_treads' });
    expect(s.current[0]).toBe('power_treads');
    s = reduce(s, { type: 'clear', slot: 0 });
    expect(s.current[0]).toBe('power_treads'); // locked
    s = play(s, ['power_treads', 'desolator', 'cyclone', 'sange_and_yasha', 'greater_crit', 'radiance']);
    expect(s.status).toBe('lost');
  });

  it('early reveal counts toward 💡 and can trigger the lifeline early', () => {
    let s = fresh();
    for (let i = 0; i < 5; i++) s = reduce(s, { type: 'revealHint' });
    expect(s.earlyReveals).toBe(5);
    expect(s.lifeline?.key).toBe('power_treads');
    s = reduce(s, { type: 'revealHint' });
    expect(s.earlyReveals).toBe(5);
  });

  it('reorders with arrows but never moves the locked slot', () => {
    let s = fresh();
    s = reduce(s, { type: 'add', key: 'bfury' });
    s = reduce(s, { type: 'add', key: 'manta' });
    s = reduce(s, { type: 'move', slot: 0, dir: 1 });
    expect(s.current.slice(0, 2)).toEqual(['manta', 'bfury']);
  });
});
