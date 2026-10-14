import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import rulesJson from '../data/item-rules.json';
import { buildAnswer } from '../scripts/pipeline/answer';
import { applyPatchRule, buildCandidates, stageRank, type Candidate } from '../scripts/pipeline/candidates';
import { ineligibleReason, type ItemRules, type RawItems } from '../scripts/pipeline/eligibility';
import type { ODMatch, ODPlayer } from '../scripts/pipeline/opendota';
import { toPuzzle, validatePuzzle } from '../scripts/pipeline/publish';
import { deriveTeamRoles } from '../scripts/pipeline/roles';
import { pickForDate, type HistoryEntry } from '../scripts/pipeline/schedule';
import items from '../public/data/items.json';
import heroes from '../public/data/heroes.json';
import type { HeroesMap, ItemsMap } from '../src/game/types';

const constantsDir = join(__dirname, '..', 'node_modules', 'dotaconstants', 'build');
const RAW = JSON.parse(readFileSync(join(constantsDir, 'items.json'), 'utf8')) as RawItems;
const rules = rulesJson as unknown as ItemRules;
const I = items as unknown as ItemsMap;
const H = heroes as unknown as HeroesMap;

const player = (log: [number, string][], extra: Partial<ODPlayer> = {}): ODPlayer => ({
  player_slot: 0,
  hero_id: 1,
  purchase_log: log.map(([time, key]) => ({ time, key })),
  ...extra,
});

describe('§7.3 eligibility', () => {
  it.each([
    ['black_king_bar', null],
    ['power_treads', null],
    ['blink', null],
    ['aghanims_shard', 'excluded'], // consumed on purchase, never in a final inventory
    ['moon_shard', null],
    ['boots', 'not-in-shop'],
    ['magic_wand', 'excluded'],
    ['bracer', 'excluded'],
    ['soul_ring', 'excluded'],
    ['orb_of_corrosion', 'excluded'],
    ['gem', 'excluded'],
    ['bottle', 'excluded'],
    ['aegis', 'excluded'],
    ['ward_dispenser', 'excluded'],
    ['recipe_black_king_bar', 'recipe'],
    ['mithril_hammer', 'not-in-shop'],
    ['urn_of_shadows', 'not-in-shop'],
  ])('%s → %s', (key, reason) => {
    expect(ineligibleReason(RAW, rules, key)).toBe(reason);
  });
});

describe('§7.4 answer = final main inventory, ordered by purchase time', () => {
  const id = (k: string) => RAW[k].id;
  const inv = (keys: string[]) => Object.fromEntries(keys.map((k, i) => [`item_${i}`, k ? id(k) : 0]));
  const keys = (r: ReturnType<typeof buildAnswer>) => (r.ok ? r.answer.map((e) => [e.key, e.timeSec]) : r.reason);

  it('orders the 6 held items by purchase time, normalizes levels, uses the last (held) copy', () => {
    const p = player(
      [
        [300, 'power_treads'],
        [650, 'blink'],
        [900, 'black_king_bar'],
        [1200, 'power_treads'], // sold and rebought → the held copy is from 1200
        [1300, 'travel_boots'],
        [1500, 'manta'],
        [1600, 'butterfly'],
        [2400, 'travel_boots_2'], // → travel_boots, timed by the level-2 purchase
        [2500, 'dagon_3'],
      ],
      inv(['manta', 'travel_boots_2', 'butterfly', 'black_king_bar', 'dagon_3', 'blink']),
    );
    expect(keys(buildAnswer(p, RAW, rules))).toEqual([
      ['blink', 650],
      ['black_king_bar', 900],
      ['manta', 1500],
      ['butterfly', 1600],
      ['travel_boots', 2400],
      ['dagon', 2500],
    ]);
  });

  it('rejects empty slots, ineligible items, duplicates and items missing from the log (S5)', () => {
    const log: [number, string][] = [[1, 'blink'], [2, 'manta'], [3, 'butterfly'], [4, 'satanic'], [5, 'skadi'], [6, 'magic_wand'], [7, 'black_king_bar']];
    const ok = ['blink', 'manta', 'butterfly', 'satanic', 'skadi', 'black_king_bar'];
    expect(buildAnswer(player(log, inv(ok)), RAW, rules).ok).toBe(true);
    expect(keys(buildAnswer(player(log, inv([...ok.slice(0, 5), ''])), RAW, rules))).toMatch(/empty/);
    expect(keys(buildAnswer(player(log, inv([...ok.slice(0, 5), 'magic_wand'])), RAW, rules))).toMatch(/ineligible.*magic_wand/);
    expect(keys(buildAnswer(player(log, inv([...ok.slice(0, 5), 'manta'])), RAW, rules))).toMatch(/duplicate/);
    expect(keys(buildAnswer(player(log, inv([...ok.slice(0, 5), 'rapier'])), RAW, rules))).toMatch(/not in purchase log/);
  });

  it('falls back to first_purchase_time when there is no purchase log', () => {
    const p = player([], {
      purchase_log: null,
      first_purchase_time: { manta: 900, power_treads: 300, bfury: 600, black_king_bar: 1200, butterfly: 1500, satanic: 1800 },
      ...inv(['satanic', 'butterfly', 'bfury', 'manta', 'power_treads', 'black_king_bar']),
    });
    expect(keys(buildAnswer(p, RAW, rules))).toEqual([
      ['power_treads', 300],
      ['bfury', 600],
      ['manta', 900],
      ['black_king_bar', 1200],
      ['butterfly', 1500],
      ['satanic', 1800],
    ]);
  });
});

describe('§7.5 roles', () => {
  const p = (slot: number, lane: number, nw: number): ODPlayer => ({ player_slot: slot, hero_id: slot + 1, lane_role: lane, net_worth: nw });
  it('assigns 1–5 from lane + net worth', () => {
    const r = deriveTeamRoles([p(0, 1, 30000), p(1, 1, 9000), p(2, 2, 25000), p(3, 3, 20000), p(4, 3, 11000)]);
    expect(r.ok && Object.fromEntries(r.pos)).toEqual({ 0: 1, 1: 5, 2: 2, 3: 3, 4: 4 });
  });
  it('flags needs_review when a lane is empty', () => {
    const r = deriveTeamRoles([p(0, 1, 30000), p(1, 1, 9000), p(2, 1, 25000), p(3, 3, 20000), p(4, 3, 11000)]);
    expect(r.ok).toBe(false);
  });
});

describe('§7.2 candidates & scheduling on cached TI 2026 data', () => {
  const ids = ['8960577698', '8960655084', '8960762254', '8960882635', '8960991322'];
  const matches = ids.map((id) => JSON.parse(readFileSync(join(__dirname, '..', 'data', 'cache', 'matches', `${id}.json`), 'utf8')) as ODMatch);
  const ctx = {
    leagues: [{ leagueId: 19719, name: 'The International 2026', stages: [] }],
    raw: RAW,
    rules,
    currentPatch: '7.41',
    patchName: (id: number | undefined) => (id === 60 ? '7.41' : null),
    stageOverrides: { '8960991322': 'Grand Final · Game 5' },
    blocked: [],
  };
  const { candidates } = buildCandidates(matches, ctx);

  it('builds candidates with draft, result and role', () => {
    const jugg = candidates.find((c) => c.id === '8960991322:1044002267')!;
    expect(jugg.heroId).toBe(8);
    expect(jugg.pos).toBe(1);
    expect(jugg.win).toBe(false);
    expect(jugg.allies[0]).toBe(8);
    expect(jugg.allies).toHaveLength(5);
    expect(jugg.enemies).toHaveLength(5);
    // Final inventory on Dotabuff: Manta, Abyssal, Nullifier, Butterfly, Swift Blink, MKB — ordered by purchase time:
    expect(jugg.answer.map((a) => a.key)).toEqual(['manta', 'monkey_king_bar', 'butterfly', 'swift_blink', 'nullifier', 'abyssal_blade']);
    expect(jugg.stage).toBe('Grand Final · Game 5');
  });

  it('S1/S4/S6 reject the right things', () => {
    const short = { ...matches[0], match_id: 1, duration: 20 * 60 };
    const other = { ...matches[0], match_id: 2, leagueid: 1 };
    const res = buildCandidates([short, other], ctx);
    expect(res.candidates).toHaveLength(0);
    expect(res.rejected.map((r) => r.rule).sort()).toEqual(['S1', 'S4']);
  });

  it('is deterministic and respects hero/match cooldowns and the support cap', () => {
    const pool = candidates;
    let history: HistoryEntry[] = [];
    const picks: Candidate[] = [];
    for (let d = 1; d <= 5; d++) {
      const date = `2026-11-0${d}`;
      const c = pickForDate(pool, date, history)!;
      expect(pickForDate(pool, date, history)!.id).toBe(c.id); // deterministic
      picks.push(c);
      history = [...history, { date, candidateId: c.id, matchId: c.matchId, heroId: c.heroId, pos: c.pos }];
    }
    expect(new Set(picks.map((p) => p.heroId)).size).toBe(5);
    expect(new Set(picks.map((p) => p.matchId)).size).toBe(5);
    expect(picks.filter((p) => p.pos >= 4).length).toBeLessThanOrEqual(2);
    expect(picks.every((p) => p.win)).toBe(true); // ranking prefers wins
  });

  it('S3 falls back to the previous patch only when the pool is small', () => {
    const cur = candidates.slice(0, 3);
    const prev = candidates.slice(3, 5).map((c) => ({ ...c, patch: '7.40' }));
    expect(applyPatchRule([...cur, ...prev], '7.41', '7.40', 2, () => true).pool).toHaveLength(3);
    expect(applyPatchRule([...cur, ...prev], '7.41', '7.40', 30, () => true).pool).toHaveLength(5);
    expect(applyPatchRule([...cur, ...prev], '7.41', '7.40', 30, () => false).pool).toHaveLength(3);
  });

  it('stage ranking prefers finals', () => {
    expect(stageRank('Grand Final · Game 2')).toBeGreaterThan(stageRank('Upper Bracket Final'));
    expect(stageRank('Playoffs')).toBeGreaterThan(stageRank('Group Stage'));
  });

  it('published puzzles validate and contain no plain-text answer', () => {
    const p = toPuzzle(candidates[0], '2026-10-14', I, H);
    expect(validatePuzzle(p, I, H)).toEqual([]);
    for (const a of candidates[0].answer) expect(JSON.stringify(p)).not.toContain(`"${a.key}"`);
    expect(validatePuzzle({ ...p, puzzleNo: 99 }, I, H)).toContain('puzzleNo does not match date');
  });
});
