// HTTP handler for the Activity backend (no framework). Dependencies are injected so the
// tests can run it with a MemoryStore and a fake Discord.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { puzzleDateAt } from '../src/game/date';
import type { BoardEntry, DiscordUserLite, MyGame } from '../src/discord/api';
import type { ItemsMap, Puzzle } from '../src/game/types';
import { parseUpload, scoreUpload, sortBoard, statsFromGames, UploadError } from './logic';
import type { Store } from './store';

export interface DiscordApi {
  exchangeCode(code: string): Promise<{ access_token: string }>;
  fetchUser(token: string): Promise<DiscordUserLite>;
  fetchGuildIds(token: string): Promise<string[]>;
}

export interface Content {
  puzzle(date: string): Promise<Puzzle | null>;
  items(): Promise<ItemsMap>;
}

export interface AppDeps {
  store: Store;
  discord: DiscordApi;
  content: Content;
  now?: () => Date;
  /** Origins allowed to call the API directly (Discord proxies requests same-origin). */
  corsOrigins?: string[];
  /** Posts/edits the results card when someone finishes (needs the bot). */
  results?: { publish(guildId: string, date: string, channelId: string | null): Promise<void> };
  /** Discord interactions endpoint (signature-checked). */
  interactions?: (raw: Buffer, headers: IncomingMessage['headers']) => Promise<{ status: number; body: unknown }>;
  /** Extra non-secret status for GET /health. */
  health?: () => object;
}

const MAX_BODY = 32 * 1024;
const CACHE_MS = 10 * 60 * 1000;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readRaw(req: IncomingMessage, max = MAX_BODY): Promise<Buffer> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > max) throw new HttpError(413, 'Body too large');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const raw = await readRaw(req);
  if (!raw.length) return null;
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Body is not valid JSON');
  }
}

/** Discord forwards mapped requests with or without the /api prefix; accept both. */
export function routePath(url: string): { path: string; query: URLSearchParams } {
  const u = new URL(url, 'http://x');
  const path = u.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  return { path, query: u.searchParams };
}

export function createApp(deps: AppDeps) {
  const now = deps.now ?? (() => new Date());
  const users = new Map<string, { user: DiscordUserLite; exp: number }>();
  const guilds = new Map<string, { ids: Set<string>; exp: number }>();
  const background = new Set<Promise<void>>();

  async function authUser(req: IncomingMessage): Promise<{ user: DiscordUserLite; token: string }> {
    const m = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
    if (!m) throw new HttpError(401, 'Sign in with Discord first');
    const token = m[1];
    const hit = users.get(token);
    if (hit && hit.exp > Date.now()) return { user: hit.user, token };
    let user: DiscordUserLite;
    try {
      user = await deps.discord.fetchUser(token);
    } catch {
      throw new HttpError(401, 'Discord sign-in expired. Reopen the Activity.');
    }
    users.set(token, { user, exp: Date.now() + CACHE_MS });
    await deps.store.upsertUser(user);
    return { user, token };
  }

  async function inGuild(token: string, guildId: string): Promise<boolean> {
    const hit = guilds.get(token);
    if (hit && hit.exp > Date.now() && hit.ids.has(guildId)) return true;
    const ids = new Set(await deps.discord.fetchGuildIds(token));
    guilds.set(token, { ids, exp: Date.now() + CACHE_MS });
    return ids.has(guildId);
  }

  /** Only today's puzzle (or earlier ones) can be played or looked up. */
  async function playablePuzzle(date: string): Promise<Puzzle> {
    if (date > puzzleDateAt(now())) throw new HttpError(404, 'That puzzle is not out yet');
    const p = await deps.content.puzzle(date);
    if (!p) throw new HttpError(404, 'No puzzle for that date');
    return p;
  }

  const toMine = (g: Awaited<ReturnType<Store['getGame']>>): MyGame | null =>
    g && { date: g.date, rows: g.rows, hintsRevealed: g.hintsRevealed, earlyReveals: g.earlyReveals, lifeline: g.lifeline, status: g.status };

  async function route(req: IncomingMessage, res: ServerResponse) {
    const { path, query } = routePath(req.url ?? '/');
    const method = req.method ?? 'GET';

    if (method === 'GET' && (path === '/' || path === '/health')) return send(res, 200, { ok: true, ...deps.health?.() });

    if (method === 'POST' && path === '/interactions') {
      if (!deps.interactions) throw new HttpError(404, 'Interactions are not configured');
      const out = await deps.interactions(await readRaw(req, 256 * 1024), req.headers);
      return send(res, out.status, out.body);
    }

    if (method === 'POST' && path === '/token') {
      const body = (await readJson(req)) as { code?: unknown } | null;
      if (typeof body?.code !== 'string' || !body.code) throw new HttpError(400, 'code is required');
      try {
        const { access_token } = await deps.discord.exchangeCode(body.code);
        return send(res, 200, { access_token });
      } catch {
        throw new HttpError(401, 'Discord rejected the sign-in code');
      }
    }

    if (method === 'GET' && path === '/game') {
      const { user } = await authUser(req);
      const date = query.get('date') ?? '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'date must be YYYY-MM-DD');
      return send(res, 200, { game: toMine(await deps.store.getGame(user.id, date)) });
    }

    if (method === 'POST' && path === '/game') {
      const { user, token } = await authUser(req);
      const upload = parseUpload(await readJson(req));
      const [puzzle, items] = await Promise.all([playablePuzzle(upload.date), deps.content.items()]);
      const previous = await deps.store.getGame(user.id, upload.date);
      const game = scoreUpload(user.id, upload, puzzle, items, previous);
      await deps.store.saveGame(game);
      if (upload.guildId && (await inGuild(token, upload.guildId))) {
        await deps.store.addGuildMember(upload.guildId, user.id);
        // Just finished: post (or update) today's results card in the server.
        if (deps.results && game.status !== 'in_progress' && previous?.status !== game.status) {
          const p = deps.results.publish(upload.guildId, game.date, upload.channelId ?? null);
          background.add(p);
          void p.finally(() => background.delete(p));
        }
      }
      return send(res, 200, { ok: true, status: game.status });
    }

    if (method === 'GET' && path === '/scoreboard') {
      const { user, token } = await authUser(req);
      const guildId = query.get('guild_id') ?? '';
      const date = query.get('date') ?? '';
      if (!/^\d{5,25}$/.test(guildId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'guild_id and date are required');
      if (!(await inGuild(token, guildId))) throw new HttpError(403, 'You are not in that server');
      await deps.store.addGuildMember(guildId, user.id);
      const rows = await deps.store.board(guildId, date);
      const entries: (BoardEntry & { name: string })[] = rows.map((r) => ({
        user: r.user,
        name: r.user.globalName || r.user.username,
        status: r.game.status,
        rows: r.game.rows.length,
        hints: r.game.earlyReveals,
        states: r.game.states, // colors only, never item keys
      }));
      return send(res, 200, { entries: sortBoard(entries).map(({ name: _n, ...e }) => e) });
    }

    if (method === 'GET' && path === '/stats') {
      const { user } = await authUser(req);
      return send(res, 200, { stats: statsFromGames(await deps.store.games(user.id)) });
    }

    throw new HttpError(404, 'Not found');
  }

  const handler = async function handler(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin;
    if (origin && deps.corsOrigins?.some((o) => o === origin || (o.startsWith('*.') && origin.endsWith(o.slice(1))))) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('access-control-allow-headers', 'authorization, content-type');
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      res.setHeader('vary', 'origin');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    try {
      await route(req, res);
    } catch (e) {
      if (e instanceof HttpError || e instanceof UploadError) return send(res, e.status, { error: e.message });
      console.error(e);
      send(res, 500, { error: 'Something went wrong on our side. Try again in a minute.' });
    }
  };
  /** Resolves once background work (results cards) has finished. For tests. */
  return Object.assign(handler, { settled: () => Promise.all([...background]).then(() => undefined) });
}
