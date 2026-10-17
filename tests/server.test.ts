// @vitest-environment node
// The Activity backend end to end: real HTTP server, in-memory store, fake Discord,
// and the puzzles actually published in public/puzzles.
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { createApp, routePath, type DiscordApi } from '../server/app';
import { MemoryStore } from '../server/store';
import { answerKey, decodeAnswer } from '../src/game/answer';
import type { ItemsMap, Puzzle } from '../src/game/types';

const root = join(__dirname, '..', 'public');
const items = JSON.parse(readFileSync(join(root, 'data', 'items.json'), 'utf8')) as ItemsMap;
const loadPuzzle = (d: string): Puzzle | null => {
  try {
    return JSON.parse(readFileSync(join(root, 'puzzles', `${d}.json`), 'utf8')) as Puzzle;
  } catch {
    return null;
  }
};
const DATE = '2026-10-16';
const puzzle = loadPuzzle(DATE)!;
const ANSWER = decodeAnswer(puzzle.answer, answerKey(puzzle.date, puzzle.puzzleNo)).map((a) => a.key);
const WRONG = Object.keys(items).filter((k) => items[k].eligible && !ANSWER.includes(k)).slice(0, 6);

const USERS: Record<string, { id: string; username: string; globalName: string | null; avatar: string | null; guilds: string[] }> = {
  tok_a: { id: '100000000000000001', username: 'ghazza', globalName: 'Ghazza', avatar: null, guilds: ['900000000000000001'] },
  tok_b: { id: '100000000000000002', username: 'friend', globalName: null, avatar: 'abc', guilds: ['900000000000000001'] },
  tok_c: { id: '100000000000000003', username: 'outsider', globalName: null, avatar: null, guilds: [] },
};
const discord: DiscordApi = {
  async exchangeCode(code) {
    if (code !== 'good-code') throw new Error('bad');
    return { access_token: 'tok_a' };
  },
  async fetchUser(t) {
    const u = USERS[t];
    if (!u) throw new Error('bad token');
    return { id: u.id, username: u.username, globalName: u.globalName, avatar: u.avatar };
  },
  async fetchGuildIds(t) {
    return USERS[t]?.guilds ?? [];
  },
};

let server: Server;
let base = '';
const store = new MemoryStore();

beforeAll(async () => {
  const app = createApp({
    store,
    discord,
    content: { puzzle: async (d) => loadPuzzle(d), items: async () => items },
    now: () => new Date('2026-10-16T12:00:00Z'),
  });
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const call = async (path: string, token?: string, body?: unknown) => {
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
};
const upload = (rows: string[][], extra: object = {}) => ({ date: DATE, rows, hintsRevealed: rows.length, earlyReveals: 0, lifeline: null, guildId: '900000000000000001', ...extra });

describe('Activity API', () => {
  it('accepts paths with or without the /api prefix (Discord proxy forwarding)', () => {
    expect(routePath('/api/game?date=x').path).toBe('/game');
    expect(routePath('/game').path).toBe('/game');
    expect(routePath('/apiary').path).toBe('/apiary');
  });

  it('exchanges an OAuth code, and rejects a bad one', async () => {
    expect(await call('/api/token', undefined, { code: 'good-code' })).toMatchObject({ status: 200, json: { access_token: 'tok_a' } });
    expect((await call('/token', undefined, { code: 'nope' })).status).toBe(401);
  });

  it('requires sign-in', async () => {
    expect((await call('/game?date=' + DATE)).status).toBe(401);
    expect((await call('/game?date=' + DATE, 'tok_forged')).status).toBe(401);
  });

  it('re-scores uploads on the server, so a client cannot fake a win', async () => {
    const r = await call('/game', 'tok_a', upload([WRONG]));
    expect(r).toMatchObject({ status: 200, json: { status: 'in_progress' } });
    const g = await store.getGame(USERS.tok_a.id, DATE);
    expect(g?.states[0]).toHaveLength(6);
    expect(g?.states[0].every((s) => s !== 'green')).toBe(true);
  });

  it("won't let earlier rows be rewritten", async () => {
    const r = await call('/game', 'tok_a', upload([[...ANSWER]]));
    expect(r.status).toBe(409);
  });

  it('rejects unknown items, duplicates and future puzzles', async () => {
    expect((await call('/game', 'tok_b', upload([['magic_wand', ...WRONG.slice(1)]]))).status).toBe(400);
    expect((await call('/game', 'tok_b', upload([[WRONG[0], ...WRONG.slice(0, 5)]]))).status).toBe(400);
    expect((await call('/game', 'tok_b', upload([WRONG], { date: '2026-10-18' }))).status).toBe(404);
  });

  it('records a win and returns the game for resuming on another device', async () => {
    const r = await call('/game', 'tok_a', upload([WRONG, [...ANSWER]]));
    expect(r.json.status).toBe('won');
    const mine = await call('/game?date=' + DATE, 'tok_a');
    expect(mine.json.game).toMatchObject({ status: 'won', rows: [WRONG, ANSWER] });
    // Finished games are frozen
    await call('/game', 'tok_a', upload([WRONG, [...ANSWER], WRONG]));
    expect((await store.getGame(USERS.tok_a.id, DATE))?.rows).toHaveLength(2);
  });

  it('scoreboard: server members only, colors only, winners first', async () => {
    await call('/game', 'tok_b', upload([WRONG]));
    const r = await call(`/scoreboard?guild_id=900000000000000001&date=${DATE}`, 'tok_b');
    expect(r.status).toBe(200);
    expect(r.json.entries.map((e: any) => [e.user.username, e.status, e.rows])).toEqual([
      ['ghazza', 'won', 2],
      ['friend', 'in_progress', 1],
    ]);
    const text = JSON.stringify(r.json);
    for (const k of ANSWER) expect(text).not.toContain(k);
    expect((await call(`/scoreboard?guild_id=900000000000000001&date=${DATE}`, 'tok_c')).status).toBe(403);
  });

  it('a forged guild id does not add the player to that server', async () => {
    await call('/game', 'tok_c', upload([WRONG], { guildId: '900000000000000001' }));
    const r = await call(`/scoreboard?guild_id=900000000000000001&date=${DATE}`, 'tok_a');
    expect(r.json.entries.map((e: any) => e.user.username)).not.toContain('outsider');
  });

  it('stats follow the Discord account', async () => {
    const r = await call('/stats', 'tok_a');
    expect(r.json.stats).toMatchObject({ played: 1, wins: 1, curStreak: 1, dist: { '2': 1 } });
  });
});
