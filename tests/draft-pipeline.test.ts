// Draft Daily pipeline tests (requirements/dota-draft-daily-prd.md §7–8) on the real TI 2026
// playoff seed in data/cache/drafts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import leagues from '../data/leagues.json';
import heroes from '../public/data/heroes.json';
import { decodeDraftSecret, buildDraftCandidates, pickDraftForDate, rankDraftCandidates, toDraftPuzzle, validateDraftPuzzle, type DraftCandidate, type DraftHistoryEntry } from '../scripts/pipeline/draft';
import { decodeSeed } from '../scripts/pipeline/import-draft-seed';
import { blockedFor, buildLedger } from '../scripts/pipeline/ledger';
import type { ODMatch } from '../scripts/pipeline/opendota';
import { eligibleForDate } from '../scripts/pipeline/schedule';
import { countPositions, typicalPosFrom } from '../scripts/pipeline/typicalPos';
import type { Candidate } from '../scripts/pipeline/candidates';
import type { HeroesMap } from '../src/game/types';

const SEED = readFileSync(join(__dirname, '..', 'data', 'cache', 'drafts', 'ti2026-playoffs.txt'), 'utf8');
const matches = decodeSeed(SEED, 19719);
const H = heroes as unknown as HeroesMap;
const ctx = {
  leagues: leagues.leagues,
  currentPatch: '7.41',
  patchName: (id: number | undefined) => (id === 60 ? '7.41' : null),
  stageOverrides: { '8960762254': 'Grand Final, game 3' } as Record<string, string>,
  blocked: [] as string[],
  heroes: H,
};
const { candidates, rejected } = buildDraftCandidates(matches, ctx);

describe('M0: TI 2026 playoff drafts', () => {
  it('decodes 38 Captain\'s Mode drafts with 10 picks and 14 bans each', () => {
    expect(matches).toHaveLength(38);
    for (const m of matches) {
      expect(m.picks_bans!.filter((x) => x.is_pick)).toHaveLength(10);
      expect(m.picks_bans!.filter((x) => !x.is_pick)).toHaveLength(14);
    }
  });

  it('fails loudly on a damaged seed line', () => {
    const broken = SEED.replace('155a25a83b', '155a25a155b'); // duplicate hero
    expect(() => decodeSeed(broken, 19719)).toThrow(/duplicate hero/);
  });

  it('every candidate passes D2 and only D5 rejects (disconnect flags in the seed)', () => {
    expect(candidates.length).toBe(60);
    expect(new Set(rejected.map((r) => r.rule))).toEqual(new Set(['D5']));
  });
});

describe('§7.4 building the answer', () => {
  const m = matches.find((x) => x.match_id === 8960762254)!;
  const c = candidates.find((x) => x.id === '8960762254:dire')!;

  it('answer = hidden picks in Captain\'s Mode order', () => {
    const picks = [...m.picks_bans!].sort((a, b) => a.order - b.order).filter((x) => x.is_pick && x.team === 1);
    expect(c.answer).toEqual(picks.map((x) => x.hero_id));
  });

  it('the board matches picks_bans order exactly and hides the answer', () => {
    const pb = [...m.picks_bans!].sort((a, b) => a.order - b.order);
    expect(c.draft.map((e) => e.order)).toEqual(pb.map((x) => x.order));
    c.draft.forEach((e, i) => {
      expect(e.type).toBe(pb[i].is_pick ? 'pick' : 'ban');
      expect(e.team).toBe(pb[i].team === 1 ? 'hidden' : 'enemy');
      if (e.type === 'pick' && e.team === 'hidden') expect(e.heroId).toBeUndefined();
      else expect(e.heroId).toBe(pb[i].hero_id);
    });
    expect(c.draft.filter((e) => e.slot).map((e) => e.slot)).toEqual([1, 2, 3, 4, 5]);
  });

  it('attaches position, player and attribute per slot', () => {
    expect([...c.positions].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(c.players).toHaveLength(5);
    c.answer.forEach((h, i) => {
      const p = m.players.find((x) => x.hero_id === h)!;
      expect(c.players[i]).toBe(p.name);
      expect(c.attributes[i]).toBe(H[h].attr);
    });
    expect(c.stage).toBe('Grand Final, game 3');
  });

  it('first pick belongs to whoever has the lowest-order pick', () => {
    for (const cand of candidates) {
      const m2 = matches.find((x) => x.match_id === cand.matchId)!;
      const first = [...m2.picks_bans!].sort((a, b) => a.order - b.order).find((x) => x.is_pick)!;
      expect(cand.hiddenHadFirstPick).toBe((first.team === 0) === (cand.hiddenSide === 'radiant'));
    }
  });
});

describe('§7.2 filters', () => {
  const m = matches[0];
  const one = (patch: Partial<ODMatch>) => buildDraftCandidates([{ ...m, ...patch }], ctx);

  it('D1 league allowlist', () => expect(one({ leagueid: 1 }).rejected[0].rule).toBe('D1'));
  it('D2 Captain\'s Mode only', () => expect(one({ game_mode: 22 }).rejected[0].rule).toBe('D2'));
  it('D2 incomplete picks_bans', () => expect(one({ picks_bans: m.picks_bans!.slice(0, 20) }).rejected[0].rule).toBe('D2'));
  it('D4 duration', () => expect(one({ duration: 14 * 60 }).rejected[0].rule).toBe('D4'));
  it('D6 unclear roles skip that side', () => {
    const players = m.players.map((p) => (p.player_slot < 128 ? { ...p, lane_role: 1 } : p));
    const r = one({ players });
    expect(r.rejected.map((x) => x.rule)).toContain('D6');
    expect(r.candidates.every((x) => x.hiddenSide === 'dire')).toBe(true);
  });
  it('D7 a pick must map to one player', () => {
    const players = m.players.map((p, i) => (i === 0 ? { ...p, hero_id: 999 } : p));
    expect(one({ players }).rejected.map((x) => x.rule)).toContain('D7');
  });
});

describe('§7.3 + D8–D10 scheduling', () => {
  const day = '2026-10-20';

  it('prefers the winning team, then the stage', () => {
    const ranked = rankDraftCandidates(candidates, day);
    expect(ranked[0].win).toBe(true);
    const firstLoss = ranked.findIndex((c) => !c.win);
    expect(ranked.slice(0, firstLoss).every((c) => c.win)).toBe(true);
  });

  it('is deterministic for a date', () => {
    expect(pickDraftForDate(candidates, day, [], new Set())?.id).toBe(pickDraftForDate([...candidates].reverse(), day, [], new Set())?.id);
  });

  it('D8: one puzzle per match, ever', () => {
    const first = pickDraftForDate(candidates, day, [], new Set())!;
    const hist: DraftHistoryEntry[] = [{ date: '2025-01-01', candidateId: first.id, matchId: first.matchId, hiddenTeam: 'x' }];
    const next = pickDraftForDate(candidates, day, hist, new Set())!;
    expect(next.matchId).not.toBe(first.matchId);
  });

  it('D9: never a match Build used', () => {
    const first = pickDraftForDate(candidates, day, [], new Set())!;
    expect(pickDraftForDate(candidates, day, [], new Set([first.matchId]))!.matchId).not.toBe(first.matchId);
  });

  it('D10: not the same hidden team on consecutive days', () => {
    const first = pickDraftForDate(candidates, day, [], new Set())!;
    const hist: DraftHistoryEntry[] = [{ date: '2026-10-19', candidateId: 'other', matchId: 1, hiddenTeam: first.hiddenTeam }];
    expect(pickDraftForDate(candidates, day, hist, new Set())!.hiddenTeam).not.toBe(first.hiddenTeam);
    // Two days back is fine.
    const old: DraftHistoryEntry[] = [{ date: '2026-10-18', candidateId: 'other', matchId: 1, hiddenTeam: first.hiddenTeam }];
    expect(pickDraftForDate(candidates, day, old, new Set())!.hiddenTeam).toBe(first.hiddenTeam);
  });

  it('a week of picks never repeats a match or a team on back-to-back days', () => {
    let hist: DraftHistoryEntry[] = [];
    let d = '2026-10-20';
    for (let i = 0; i < 7; i++) {
      const c = pickDraftForDate(candidates, d, hist, new Set())!;
      hist = [...hist, { date: d, candidateId: c.id, matchId: c.matchId, hiddenTeam: c.hiddenTeam }];
      d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    }
    expect(new Set(hist.map((h) => h.matchId)).size).toBe(7);
    for (let i = 1; i < hist.length; i++) expect(hist[i].hiddenTeam).not.toBe(hist[i - 1].hiddenTeam);
  });
});

describe('§8 shared used-match ledger', () => {
  it('each mode is blocked only by the other mode', () => {
    const ledger = buildLedger(
      [{ date: '2026-10-20', candidateId: 'a', matchId: 1, heroId: 1, pos: 1 }],
      [{ date: '2026-10-20', candidateId: 'b', matchId: 2, hiddenTeam: 't' }],
    );
    expect([...blockedFor('draft', ledger)]).toEqual([1]);
    expect([...blockedFor('build', ledger)]).toEqual([2]);
  });

  it('Build skips matches Draft has scheduled', () => {
    const c = { id: 'x', matchId: 42, heroId: 1, pos: 1 } as Candidate;
    expect(eligibleForDate([c], '2026-10-20', [])).toHaveLength(1);
    expect(eligibleForDate([c], '2026-10-20', [], new Set([42]))).toHaveLength(0);
  });
});

describe('§9.1 puzzle file + validation', () => {
  const c = candidates.find((x) => x.win) as DraftCandidate;
  const p = toDraftPuzzle(c, '2026-10-20');

  it('validates and keeps the match ID inside the secret only', () => {
    expect(validateDraftPuzzle(p, H)).toEqual([]);
    expect(JSON.stringify({ ...p, secret: '' })).not.toContain(String(c.matchId));
    expect(decodeDraftSecret(p)).toEqual({ answer: c.answer, match: { matchId: c.matchId, radiantTeam: c.radiantTeam, direTeam: c.direTeam } });
    expect(p.puzzleNo).toBe(1);
  });

  it('rejects a leaked hidden hero or a wrong puzzle number', () => {
    const leak = { ...p, draft: p.draft.map((e) => (e.slot === 1 ? { ...e, heroId: c.answer[0] } : e)) };
    expect(validateDraftPuzzle(leak, H).join()).toMatch(/leaks/);
    expect(validateDraftPuzzle({ ...p, puzzleNo: 9 }, H).join()).toMatch(/puzzleNo/);
  });
});

describe('§7.5 typical position', () => {
  it('takes the most common position above the game threshold', () => {
    expect(typicalPosFrom([0, 5, 1, 0, 0])).toBe(2);
    expect(typicalPosFrom([1, 1, 0, 0, 0])).toBeNull(); // below 3 games
    expect(typicalPosFrom([2, 2, 0, 0, 0])).toBe(1); // tie → lower position
  });

  it('counts every team in the seed', () => {
    const counts = countPositions(matches);
    const total = [...counts.values()].reduce((a, c) => a + c.reduce((x, y) => x + y, 0), 0);
    expect(total).toBe(38 * 10);
    // Spot check against TI 2026: Faceless Void (41) is a carry, Earth Spirit (107) a mid or 4.
    expect(H[41].typicalPos).toBe(1);
  });
});
