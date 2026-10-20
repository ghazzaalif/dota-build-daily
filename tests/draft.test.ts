// Draft Daily engine tests (requirements/dota-draft-daily-prd.md Appendix A, §5, F7, F8).
import { MAX_ROWS } from '../src/config';
import { decodeSecret, encodeSecret } from '../src/game/answer';
import { draftPuzzleNumber, draftSecretKey } from '../src/game/draft/date';
import { draftReducer, initDraftGame, toDraftSaved, unavailableHeroes, type DraftContext, type DraftState } from '../src/game/draft/game';
import { autoDraftLevel, buildHints, DRAFT_HINTS, LIFELINE_LEVEL, unlockedDraftLevel } from '../src/game/draft/hints';
import { bestDraftStates, isWinningDraftRow, scoreDraft } from '../src/game/draft/scoring';
import { buildDraftShareText, shortStage, shortTournament } from '../src/game/draft/share';
import { loadDraftGame, loadDraftStats, saveDraftGame } from '../src/game/draft/storage';
import { buildHeroIndex, searchHeroes } from '../src/game/draft/search';
import { _resetStorageForTests, loadGame, loadStats, saveGame } from '../src/game/storage';
import type { DraftTileState } from '../src/game/draft/types';
import heroesJson from '../public/data/heroes.json';
import type { HeroesMap } from '../src/game/types';

// Hero IDs from heroes.json.
const H = {
  tiny: 19,
  faceless_void: 41,
  puck: 13,
  mars: 129,
  crystal_maiden: 5,
  earthshaker: 7,
  storm_spirit: 17,
  lion: 26,
  lina: 25,
  zeus: 22,
  axe: 2,
  sniper: 35,
  pudge: 14,
  invoker: 74,
};
const ANSWER = [H.tiny, H.faceless_void, H.puck, H.mars, H.crystal_maiden];
const states = (guess: number[]) => scoreDraft(guess, ANSWER).map((t) => t.state);
const E: Record<string, DraftTileState> = { G: 'green', Y: 'yellow', X: 'grey' };
const expect6 = (code: string) => [...code].map((c) => E[c]);

describe('Appendix A: scoring', () => {
  it.each([
    [[H.tiny, H.faceless_void, H.puck, H.mars, H.crystal_maiden], 'GGGGG'],
    [[H.faceless_void, H.tiny, H.puck, H.mars, H.crystal_maiden], 'YYGGG'],
    [[H.crystal_maiden, H.tiny, H.faceless_void, H.puck, H.mars], 'YYYYY'],
    [[H.earthshaker, H.puck, H.storm_spirit, H.mars, H.lion], 'XYXGX'],
    [[H.lion, H.lina, H.zeus, H.axe, H.sniper], 'XXXXX'],
    [[H.tiny, H.puck, H.faceless_void, H.lion, H.crystal_maiden], 'GYYXG'],
  ])('%j → %s', (guess, code) => {
    expect(states(guess)).toEqual(expect6(code));
  });

  it('never produces an orange tile', () => {
    for (const g of [[H.lion, H.lina, H.zeus, H.axe, H.sniper], ANSWER]) {
      expect(scoreDraft(g, ANSWER).every((t) => ['green', 'yellow', 'grey'].includes(t.state))).toBe(true);
    }
  });

  it('a win is all green', () => {
    expect(isWinningDraftRow(scoreDraft(ANSWER, ANSWER))).toBe(true);
    expect(isWinningDraftRow(scoreDraft([H.faceless_void, H.tiny, H.puck, H.mars, H.crystal_maiden], ANSWER))).toBe(false);
  });

  it('picker shading keeps the best state per hero', () => {
    const r1 = scoreDraft([H.faceless_void, H.lion, H.lina, H.zeus, H.axe], ANSWER); // void 🟨
    const r2 = scoreDraft([H.tiny, H.faceless_void, H.lina, H.zeus, H.axe], ANSWER); // void 🟩
    const best = bestDraftStates([r1, r2]);
    expect(best[H.faceless_void]).toBe('green');
    expect(best[H.tiny]).toBe('green');
    expect(best[H.lion]).toBe('grey');
  });
});

// A tiny draft: 2 bans + 1 enemy pick, so pudge/invoker/sniper can't be used.
const puzzleDraft = {
  draft: [
    { order: 0, type: 'ban' as const, team: 'hidden' as const, heroId: H.pudge },
    { order: 1, type: 'ban' as const, team: 'enemy' as const, heroId: H.invoker },
    { order: 2, type: 'pick' as const, team: 'enemy' as const, heroId: H.sniper },
    { order: 3, type: 'pick' as const, team: 'hidden' as const, slot: 1 },
  ],
};
const ctx: DraftContext = { answer: ANSWER, unavailable: unavailableHeroes(puzzleDraft) };

function play(state: DraftState, row: number[]): DraftState {
  const reduce = draftReducer(ctx);
  let s = reduce(state, { type: 'clearAll' });
  for (let i = 0; i < 5; i++) s = reduce(s, { type: 'clear', slot: i });
  for (const h of row) s = reduce(s, { type: 'add', heroId: h });
  return reduce(s, { type: 'submit' });
}

describe('§5.4 input rules', () => {
  const fresh = () => initDraftGame(ctx, null, false);

  it('banned and enemy-picked heroes are unavailable', () => {
    expect([...ctx.unavailable].sort()).toEqual([H.pudge, H.invoker, H.sniper].sort());
  });

  it('a banned or enemy hero never enters a row', () => {
    const reduce = draftReducer(ctx);
    let s = reduce(fresh(), { type: 'add', heroId: H.pudge });
    expect(s.current).not.toContain(H.pudge);
    expect(s.error).toMatch(/banned/i);
    s = reduce(s, { type: 'add', heroId: H.sniper });
    expect(s.current).not.toContain(H.sniper);
  });

  it('rejects a row with fewer than 5 heroes', () => {
    const reduce = draftReducer(ctx);
    let s = fresh();
    for (const h of [H.lion, H.lina]) s = reduce(s, { type: 'add', heroId: h });
    s = reduce(s, { type: 'submit' });
    expect(s.rows).toHaveLength(0);
    expect(s.error).toMatch(/all 5/);
  });

  it("can't add the same hero twice", () => {
    const reduce = draftReducer(ctx);
    let s = reduce(fresh(), { type: 'add', heroId: H.lion });
    s = reduce(s, { type: 'add', heroId: H.lion });
    expect(s.current.filter((h) => h === H.lion)).toHaveLength(1);
  });

  it('rejects a row identical to an earlier row', () => {
    let s = play(fresh(), [H.lion, H.lina, H.zeus, H.axe, H.earthshaker]);
    expect(s.rows).toHaveLength(1);
    s = play(s, [H.lion, H.lina, H.zeus, H.axe, H.earthshaker]);
    expect(s.rows).toHaveLength(1);
    expect(s.error).toMatch(/already tried/);
  });

  it('keep greens pre-fills confirmed slots', () => {
    const s = play(initDraftGame(ctx, null, true), [H.tiny, H.lion, H.lina, H.zeus, H.axe]);
    expect(s.current).toEqual([H.tiny, null, null, null, null]);
  });

  it('move swaps neighbours', () => {
    const reduce = draftReducer(ctx);
    let s = reduce(fresh(), { type: 'add', heroId: H.lion });
    s = reduce(s, { type: 'add', heroId: H.lina });
    s = reduce(s, { type: 'move', slot: 0, dir: 1 });
    expect(s.current.slice(0, 2)).toEqual([H.lina, H.lion]);
  });
});

describe('§5.1 game flow', () => {
  const wrong = [
    [H.lion, H.lina, H.zeus, H.axe, H.earthshaker],
    [H.lina, H.lion, H.zeus, H.axe, H.earthshaker],
    [H.zeus, H.lina, H.lion, H.axe, H.earthshaker],
    [H.axe, H.lina, H.zeus, H.lion, H.earthshaker],
    [H.earthshaker, H.lina, H.zeus, H.axe, H.lion],
    [H.lion, H.zeus, H.lina, H.axe, H.earthshaker],
  ];

  it('wins on an all-green row', () => {
    const s = play(initDraftGame(ctx, null, false), ANSWER);
    expect(s.status).toBe('won');
  });

  it('loses after 6 wrong rows', () => {
    let s = initDraftGame(ctx, null, false);
    for (const r of wrong) s = play(s, r);
    expect(s.rows).toHaveLength(MAX_ROWS);
    expect(s.status).toBe('lost');
  });

  it('unlocks one hint per wrong row and the lifeline after row 5', () => {
    let s = initDraftGame(ctx, null, false);
    for (let i = 0; i < 5; i++) {
      s = play(s, wrong[i]);
      expect(s.hintsRevealed).toBe(autoDraftLevel(i + 1));
    }
    expect(s.hintsRevealed).toBe(LIFELINE_LEVEL);
    expect(s.lifeline).toEqual({ slot: 0, heroId: H.tiny });
    expect(s.current[0]).toBe(H.tiny);
    // The locked slot can't be cleared or moved.
    const reduce = draftReducer(ctx);
    expect(reduce(s, { type: 'clear', slot: 0 }).current[0]).toBe(H.tiny);
    expect(reduce(s, { type: 'move', slot: 0, dir: 1 }).current[0]).toBe(H.tiny);
  });

  it('lifeline targets the earliest slot never solved', () => {
    let s = initDraftGame(ctx, null, false);
    s = play(s, [H.tiny, H.faceless_void, H.lion, H.lina, H.zeus]); // slots 1–2 solved
    for (let i = 0; i < 4; i++) s = play(s, [H.tiny, H.faceless_void, ...[[H.lion, H.lina, H.axe], [H.lina, H.lion, H.axe], [H.axe, H.lion, H.lina], [H.zeus, H.axe, H.lion]][i]]);
    expect(s.lifeline).toEqual({ slot: 2, heroId: H.puck });
  });

  it('early reveals count separately and an early lifeline locks its slot', () => {
    const reduce = draftReducer(ctx);
    let s = initDraftGame(ctx, null, false);
    for (let i = 0; i < 5; i++) s = reduce(s, { type: 'revealHint' });
    expect(s.earlyReveals).toBe(5);
    expect(s.lifeline?.heroId).toBe(H.tiny);
    s = play(s, [H.lion, H.lina, H.zeus, H.axe]); // 4 more fill the free slots
    expect(s.rows[0][0]).toBe(H.tiny);
  });

  it('restores from saved state, rescoring rows', () => {
    let s = play(initDraftGame(ctx, null, false), wrong[0]);
    s = play(s, wrong[1]);
    const restored = initDraftGame(ctx, toDraftSaved(s), false);
    expect(restored.scored).toEqual(s.scored);
    expect(restored.hintsRevealed).toBe(s.hintsRevealed);
  });
});

describe('§5.3 hint schedule', () => {
  it('follows the default order', () => {
    expect(DRAFT_HINTS.map((h) => [h.id, h.afterRow])).toEqual([
      ['positions', 1],
      ['teams', 2],
      ['players', 3],
      ['attributes', 4],
      ['lifeline', 5],
    ]);
    expect(autoDraftLevel(0)).toBe(0);
    expect(autoDraftLevel(3)).toBe(3);
    expect(autoDraftLevel(6)).toBe(5);
    expect(unlockedDraftLevel(1, 3, false)).toBe(3);
    expect(unlockedDraftLevel(0, 0, true)).toBe(5);
  });

  it('POSITION_HINT_AT_ROW = 0 opens positions from the start', () => {
    const hints = buildHints(0);
    expect(hints[0]).toMatchObject({ id: 'positions', afterRow: 0, level: 1 });
    expect(autoDraftLevel(0, hints)).toBe(1);
    expect(autoDraftLevel(1, hints)).toBe(1);
    expect(autoDraftLevel(2, hints)).toBe(2);
  });
});

describe('F7 share', () => {
  it('matches the PRD format byte for byte', () => {
    const rows: DraftTileState[][] = [
      ['yellow', 'grey', 'grey', 'grey', 'yellow'],
      ['green', 'yellow', 'grey', 'grey', 'yellow'],
      ['green', 'green', 'yellow', 'green', 'yellow'],
      ['green', 'green', 'green', 'green', 'green'],
    ];
    const text = buildDraftShareText({ puzzleNo: 12, tournament: 'The International 2026', stage: 'Grand Final', rows, won: true, hintsUsed: 1 });
    expect(text).toBe(
      [
        'Dota Draft Daily #12 — TI 2026 · Grand Final',
        '4/6 💡1',
        '🟨⬛⬛⬛🟨',
        '🟩🟨⬛⬛🟨',
        '🟩🟩🟨🟩🟨',
        '🟩🟩🟩🟩🟩',
        'https://dota-build-daily.onrender.com/play/draft',
      ].join('\n'),
    );
  });

  it('shows X/6 on a loss and adapts to colorblind mode', () => {
    const t = buildDraftShareText({ puzzleNo: 1, tournament: 'DreamLeague Season 27', stage: 'Playoffs', rows: [['green', 'yellow', 'grey', 'grey', 'grey']], won: false, hintsUsed: 0, colorblind: true });
    expect(t.split('\n')[1]).toBe('X/6 💡0');
    expect(t.split('\n')[2]).toBe('🟦🟧⬛⬛⬛');
    expect(t).toContain('DreamLeague Season 27 · Playoffs');
  });

  it('shortens names', () => {
    expect(shortTournament('The International 2026')).toBe('TI 2026');
    expect(shortStage('Grand Final, game 5')).toBe('Grand Final');
  });
});

describe('secret + numbering', () => {
  it('round-trips the secret', () => {
    const secret = { answer: ANSWER, match: { matchId: 8960991322, radiantTeam: 'A', direTeam: 'B' } };
    const key = draftSecretKey('2026-10-20', 1);
    expect(decodeSecret(encodeSecret(secret, key), key)).toEqual(secret);
  });
  it('has its own puzzle counter', () => {
    expect(draftPuzzleNumber('2026-10-20')).toBe(1);
    expect(draftPuzzleNumber('2026-10-31')).toBe(12);
  });
});

describe('F8 storage is separate from Build Daily', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetStorageForTests();
  });

  it('draft saves never touch dbd:v1 keys', () => {
    saveGame('2026-10-20', { rows: [['bfury']], hintsRevealed: 1, earlyReveals: 0, status: 'in_progress' });
    saveDraftGame('2026-10-20', { rows: [[1, 2, 3, 4, 5]], hintsRevealed: 1, earlyReveals: 0, status: 'in_progress' });
    expect(loadGame('2026-10-20')?.rows).toEqual([['bfury']]);
    expect(loadDraftGame('2026-10-20')?.rows).toEqual([[1, 2, 3, 4, 5]]);
    expect(Object.keys(localStorage).sort()).toEqual(['dbd:draft:v1:game:2026-10-20', 'dbd:v1:game:2026-10-20']);
    expect(loadDraftStats().played).toBe(0);
    expect(loadStats().played).toBe(0);
  });
});

describe('F4 hero search', () => {
  const index = buildHeroIndex(heroesJson as unknown as HeroesMap);
  const top = (q: string) => searchHeroes(index, q)[0]?.hero.name;
  it.each([
    ['am', 'Anti-Mage'],
    ['sf', 'Shadow Fiend'],
    ['qop', 'Queen of Pain'],
    ['wr', 'Windranger'],
    ['es', 'Earthshaker'],
    ['cm', 'Crystal Maiden'],
    ['od', 'Outworld Devourer'],
    ['pa', 'Phantom Assassin'],
    ['ta', 'Templar Assassin'],
    ['wd', 'Witch Doctor'],
    ['void', 'Faceless Void'],
    ['puck', 'Puck'],
  ])('%s → %s', (q, name) => expect(top(q)).toBe(name));

  it('every nickname resolves within 50 ms', () => {
    const t0 = performance.now();
    for (const e of index) for (const a of e.hero.aliases ?? []) searchHeroes(index, a);
    expect(performance.now() - t0).toBeLessThan(50 * Math.max(1, index.length / 10));
  });
});
