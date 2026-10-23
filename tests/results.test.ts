// @vitest-environment node
// Results card in Discord: rendering, posting/editing one message per channel per day,
// and the interactions endpoint (signatures, Play now!, /results-channel).
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { createApp, type DiscordApi } from '../server/app';
import { cardSvg, renderCard } from '../server/card';
import { createInteractions, verifySignature } from '../server/interactions';
import { createResultsPublisher, namesLine, type BotApi, type OutgoingMessage } from '../server/results';
import { MemoryStore } from '../server/store';
import { woffToSfnt } from '../server/woff';
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
const GUILD = '900000000000000001';
const CH_OPEN = '700000000000000001';
const CH_FIXED = '700000000000000002';
const CH_OTHER_SERVER = '700000000000000009';

const USERS: Record<string, { id: string; username: string; globalName: string | null }> = {
  tok_a: { id: '100000000000000001', username: 'ghazza', globalName: 'Ghazza' },
  tok_b: { id: '100000000000000002', username: 'river', globalName: 'River' },
  tok_c: { id: '100000000000000003', username: 'night', globalName: null },
};
const discord: DiscordApi = {
  async exchangeCode() {
    throw new Error('unused');
  },
  async fetchUser(t) {
    const u = USERS[t];
    if (!u) throw new Error('bad token');
    return { ...u, avatar: null };
  },
  async fetchGuildIds(t) {
    return USERS[t] ? [GUILD] : [];
  },
};

class FakeBot implements BotApi {
  log: { op: 'create' | 'edit'; channel: string; id: string; msg: OutgoingMessage }[] = [];
  deleted = new Set<string>();
  n = 0;
  botGuilds = new Set([GUILD]);
  hidden = new Set<string>();
  async channelGuild(c: string) {
    if (this.hidden.has(c)) return null;
    return c === CH_OTHER_SERVER ? '900000000000000099' : GUILD;
  }
  async inGuild(g: string) {
    return this.botGuilds.has(g);
  }
  async createMessage(channel: string, msg: OutgoingMessage) {
    const id = `m${++this.n}`;
    this.log.push({ op: 'create', channel, id, msg });
    return id;
  }
  async editMessage(channel: string, id: string, msg: OutgoingMessage) {
    if (this.deleted.has(id)) return false;
    this.log.push({ op: 'edit', channel, id, msg });
    return true;
  }
  async fetchImage() {
    return null;
  }
}

describe('results card image', () => {
  it('converts the bundled WOFF fonts to fonts resvg can read', () => {
    const req = createRequire(import.meta.url);
    const ttf = woffToSfnt(readFileSync(req.resolve('@fontsource/sofia-sans/files/sofia-sans-latin-700-normal.woff')));
    expect([0x00010000, 0x4f54544f]).toContain(ttf.readUInt32BE(0)); // TrueType or 'OTTO'
    expect(ttf.readUInt16BE(4)).toBeGreaterThan(5);
  });

  it('draws colours only, escapes names, and renders a PNG', async () => {
    const players = [
      { name: 'Ghazza', avatar: null, status: 'won' as const, states: [['green', 'yellow', 'orange', 'grey', 'grey', 'grey'], Array(6).fill('green')] },
      { name: '<b>&"x"', avatar: null, status: 'lost' as const, states: Array(6).fill(Array(6).fill('grey')) },
    ];
    const svg = cardSvg({ puzzleNo: 7, players });
    expect(svg).toContain('#7');
    expect(svg).toContain('&#60;b&#62;&#38;&#34;x&#34;');
    for (const k of ANSWER) expect(svg).not.toContain(k);
    const png = await renderCard({ puzzleNo: 7, players });
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('names line', () => {
    expect(namesLine(['A'])).toBe('**A**');
    expect(namesLine(['A', 'B'])).toBe('**A** and **B**');
    expect(namesLine(['A', 'B', 'C'])).toBe('**A**, **B** and **C**');
    expect(namesLine(['A', 'B', 'C', 'D', 'E'])).toBe('**A**, **B**, **C** and 2 others');
    expect(namesLine(['a_b*'])).toBe('**a\\_b\\***');
  });
});

describe('posting the results card', () => {
  let server: Server;
  let base = '';
  const store = new MemoryStore();
  const bot = new FakeBot();
  const content = { puzzle: async (d: string) => loadPuzzle(d), items: async () => items };
  const app = createApp({
    store,
    discord,
    content,
    now: () => new Date('2026-10-16T12:00:00Z'),
    results: createResultsPublisher({ store, content, bot, retryMs: [] }),
  });

  beforeAll(async () => {
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  const upload = async (token: string, rows: string[][], channelId = CH_OPEN) => {
    const res = await fetch(`${base}/game`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ date: DATE, rows, hintsRevealed: rows.length, earlyReveals: 0, lifeline: null, guildId: GUILD, channelId }),
    });
    expect(res.status).toBe(200);
    await app.settled();
  };

  it('nothing is posted while a game is in progress', async () => {
    await upload('tok_a', [WRONG]);
    expect(bot.log).toHaveLength(0);
  });

  it('posts in the channel the game was opened in when someone finishes', async () => {
    await upload('tok_a', [WRONG, [...ANSWER]]);
    expect(bot.log).toHaveLength(1);
    expect(bot.log[0]).toMatchObject({ op: 'create', channel: CH_OPEN });
    expect(bot.log[0].msg.content).toBe(`**Ghazza** has played Dota Build Daily #${puzzle.puzzleNo}`);
    for (const k of ANSWER) expect(bot.log[0].msg.content).not.toContain(items[k].name);
  });

  it('re-uploading a finished game does not post again', async () => {
    await upload('tok_a', [WRONG, [...ANSWER]]);
    expect(bot.log).toHaveLength(1);
  });

  it('the next finisher edits the same message', async () => {
    await upload('tok_b', [[...ANSWER]]);
    expect(bot.log[1]).toMatchObject({ op: 'edit', channel: CH_OPEN, id: 'm1' });
    expect(bot.log[1].msg.content).toBe(`**River** and **Ghazza** have played Dota Build Daily #${puzzle.puzzleNo}`);
  });

  it('if the message was deleted, a new one is posted', async () => {
    bot.deleted.add('m1');
    await upload('tok_c', [WRONG, WRONG.slice().reverse(), [...ANSWER]]);
    expect(bot.log[2]).toMatchObject({ op: 'create', channel: CH_OPEN });
    expect(await store.getPost(GUILD, DATE, CH_OPEN)).toBe(bot.log[2].id);
  });

  it('a fixed results channel wins over where the game was opened', async () => {
    await store.setResultsChannel(GUILD, CH_FIXED);
    const before = bot.log.length;
    await createResultsPublisher({ store, content, bot }).publish(GUILD, DATE, CH_OPEN);
    expect(bot.log[before]).toMatchObject({ op: 'create', channel: CH_FIXED });
  });

  it("never posts in a channel from another server", async () => {
    await store.setResultsChannel(GUILD, null);
    const before = bot.log.length;
    await createResultsPublisher({ store, content, bot }).publish(GUILD, DATE, CH_OTHER_SERVER);
    expect(bot.log).toHaveLength(before);
  });
});

describe('interactions endpoint', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubHex = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  const store = new MemoryStore();
  const handle = createInteractions({ store, publicKey: pubHex });
  const signed = (body: object, ts = '1700000000') => {
    const raw = Buffer.from(JSON.stringify(body));
    const sig = sign(null, Buffer.concat([Buffer.from(ts), raw]), privateKey).toString('hex');
    return [raw, { 'x-signature-ed25519': sig, 'x-signature-timestamp': ts }] as const;
  };

  it('rejects bad signatures and answers PING', async () => {
    const [raw, h] = signed({ type: 1 });
    expect(await handle(raw, h)).toEqual({ status: 200, body: { type: 1 } });
    expect((await handle(Buffer.from('{"type":1} '), h)).status).toBe(401);
    expect((await handle(raw, { ...h, 'x-signature-ed25519': '00'.repeat(64) })).status).toBe(401);
    expect(verifySignature('nothex', 'x', 'y', raw)).toBe(false);
  });

  it('Play now! and the entry point command launch the Activity', async () => {
    expect((await handle(...signed({ type: 3, data: { custom_id: 'launch' } }))).body).toEqual({ type: 12 });
    expect((await handle(...signed({ type: 2, data: { type: 4, name: 'launch' } }))).body).toEqual({ type: 12 });
  });

  it('/results-channel needs Manage Server, then sets and clears the channel', async () => {
    const cmd = (perms: string, channel?: string) =>
      handle(...signed({ type: 2, guild_id: GUILD, member: { permissions: perms }, data: { type: 1, name: 'results-channel', options: channel ? [{ name: 'channel', value: channel }] : [] } }));
    const denied = (await cmd('0', CH_FIXED)).body as { data: { content: string; flags: number } };
    expect(denied.data.content).toContain('Manage Server');
    expect(denied.data.flags).toBe(64);
    expect(await store.getResultsChannel(GUILD)).toBeNull();
    const ok = (await cmd(String(1 << 5), CH_FIXED)).body as { data: { content: string } };
    expect(ok.data.content).toContain(`<#${CH_FIXED}>`);
    expect(await store.getResultsChannel(GUILD)).toBe(CH_FIXED);
    await cmd(String((1 << 5) | (1 << 3)));
    expect(await store.getResultsChannel(GUILD)).toBeNull();
  });
});

describe('when Discord is temporarily blocking us', () => {
  it('retries a failed post and succeeds later', async () => {
    const store = new MemoryStore();
    const bot = new FakeBot();
    let fail = 2;
    const create = bot.createMessage.bind(bot);
    bot.createMessage = async (c, m) => {
      if (fail-- > 0) throw new Error('429 blocked');
      return create(c, m);
    };
    await store.upsertUser({ id: '1', username: 'a', globalName: 'A', avatar: null });
    await store.addGuildMember(GUILD, '1');
    await store.saveGame({ userId: '1', date: DATE, puzzleNo: puzzle.puzzleNo, rows: [ANSWER], states: [Array(6).fill('green')], status: 'won', hintsRevealed: 0, earlyReveals: 0, lifeline: null });
    const content = { puzzle: async (d: string) => loadPuzzle(d), items: async () => items };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await createResultsPublisher({ store, content, bot, retryMs: [5, 5, 5] }).publish(GUILD, DATE, CH_OPEN);
    await new Promise((r) => setTimeout(r, 200));
    errSpy.mockRestore();
    expect(bot.log).toHaveLength(1);
    expect(bot.log[0]).toMatchObject({ op: 'create', channel: CH_OPEN });
  });
});

describe('results status (why a card did or did not post)', () => {
  const content = { puzzle: async (d: string) => loadPuzzle(d), items: async () => items };

  it('ok when the bot is in the server and can see the channel', async () => {
    const pub = createResultsPublisher({ store: new MemoryStore(), content, bot: new FakeBot(), retryMs: [] });
    expect(await pub.status(GUILD, CH_OPEN)).toEqual({ state: 'ok', fixedChannel: false });
  });

  it('no_bot when the bot was never added to the server (Discord answers 403)', async () => {
    const bot = new FakeBot();
    bot.botGuilds.clear();
    const pub = createResultsPublisher({ store: new MemoryStore(), content, bot, retryMs: [] });
    expect((await pub.status(GUILD, CH_OPEN)).state).toBe('no_bot');
  });

  it('no_channel_access when the channel is private to the bot; reports a pinned channel', async () => {
    const bot = new FakeBot();
    bot.hidden.add(CH_FIXED);
    const store = new MemoryStore();
    await store.setResultsChannel(GUILD, CH_FIXED);
    const pub = createResultsPublisher({ store, content, bot, retryMs: [] });
    expect(await pub.status(GUILD, CH_OPEN)).toEqual({ state: 'no_channel_access', fixedChannel: true });
  });

  it('post_failed carries the last Discord error until a post succeeds', async () => {
    const bot = new FakeBot();
    const store = new MemoryStore();
    await store.upsertUser({ id: '1', username: 'a', globalName: 'A', avatar: null });
    await store.addGuildMember(GUILD, '1');
    await store.saveGame({ userId: '1', date: DATE, puzzleNo: puzzle.puzzleNo, rows: [ANSWER], states: [Array(6).fill('green')], status: 'won', hintsRevealed: 0, earlyReveals: 0, lifeline: null });
    const create = bot.createMessage.bind(bot);
    let fail = true;
    bot.createMessage = async (c, m) => {
      if (fail) throw new Error('post in 7: 403 {"message": "Missing Permissions", "code": 50013}');
      return create(c, m);
    };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pub = createResultsPublisher({ store, content, bot, retryMs: [] });
    await pub.publish(GUILD, DATE, CH_OPEN);
    expect(await pub.status(GUILD, CH_OPEN)).toMatchObject({ state: 'post_failed', error: expect.stringContaining('Missing Permissions') });
    fail = false;
    await pub.publish(GUILD, DATE, CH_OPEN);
    expect((await pub.status(GUILD, CH_OPEN)).state).toBe('ok');
    errSpy.mockRestore();
  });

  it('no_channel outside a server channel (DMs)', async () => {
    const pub = createResultsPublisher({ store: new MemoryStore(), content, bot: new FakeBot(), retryMs: [] });
    expect((await pub.status(GUILD, null)).state).toBe('no_channel');
  });
});
