// Local stand-in for Discord, for testing the Activity end to end without Discord.
//
//   VITE_DISCORD_CLIENT_ID=123456789012345678 VITE_API_URL=http://api.example.test npm run build   (http: the fake host is http)
//   npx tsx tests/e2e/discord-host.ts            → http://localhost:4400/host.html?as=a
//
// It serves dist/ the way Discord's proxy does (same origin), routes /api/* to the real
// backend handler (in-memory store, fake Discord OAuth), and host.html iframes the game
// with Discord's launch params and answers the SDK's RPC messages (handshake, authorize,
// authenticate, share, presence). Every command the game sends is recorded in
// window.__commands on the host page.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
import { createApp, type Content, type DiscordApi } from '../../server/app';
import { createResultsPublisher, type BotApi } from '../../server/results';
import { MemoryStore } from '../../server/store';
import type { ItemsMap, Puzzle } from '../../src/game/types';

const ROOT = join(HERE, '..', '..');
const DIST = join(ROOT, 'dist');
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT ?? 4400);
export const GUILD = '900000000000000001';

export const PLAYERS: Record<string, { code: string; token: string; id: string; username: string; global_name: string | null }> = {
  a: { code: 'code-a', token: 'tok-a', id: '100000000000000001', username: 'ghazza', global_name: 'Ghazza' },
  b: { code: 'code-b', token: 'tok-b', id: '100000000000000002', username: 'friend', global_name: 'Friend' },
};

const discord: DiscordApi = {
  async exchangeCode(code) {
    const p = Object.values(PLAYERS).find((x) => x.code === code);
    if (!p) throw new Error('bad code');
    return { access_token: p.token };
  },
  async fetchUser(token) {
    const p = Object.values(PLAYERS).find((x) => x.token === token);
    if (!p) throw new Error('bad token');
    return { id: p.id, username: p.username, globalName: p.global_name, avatar: null };
  },
  async fetchGuildIds(token) {
    return Object.values(PLAYERS).some((x) => x.token === token) ? [GUILD] : [];
  },
};

export const store = new MemoryStore();
/** Fake bot that was never added to the test server, so the end screen shows the "add the bot" notice. */
export const fakeBot: BotApi & { posts: string[] } = {
  posts: [],
  async channelGuild() {
    return null;
  },
  async inGuild() {
    return false;
  },
  async createMessage(c) {
    this.posts.push(c);
    return 'm1';
  },
  async editMessage() {
    return true;
  },
  async fetchImage() {
    return null;
  },
};
const content: Content = {
    async puzzle(d) {
      const f = join(PUBLIC, 'puzzles', `${d}.json`);
      return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Puzzle) : null;
    },
    async items() {
      return JSON.parse(readFileSync(join(PUBLIC, 'data', 'items.json'), 'utf8')) as ItemsMap;
    },
};
const api = createApp({ store, discord, content, results: createResultsPublisher({ store, content, bot: fakeBot, retryMs: [] }) });

const HOST_PAGE = (as: string) => `<!doctype html><meta charset="utf-8"><title>Fake Discord</title>
<style>html,body{margin:0;height:100%;background:#313338}iframe{border:0;width:100%;height:100%}</style>
<iframe id="activity" src="/?frame_id=frame-${as}&instance_id=inst-1&platform=desktop&guild_id=${GUILD}&channel_id=800000000000000001"></iframe>
<script>
const P = ${JSON.stringify(PLAYERS)}[${JSON.stringify(as)}];
window.__commands = [];
window.addEventListener('message', (e) => {
  if (!Array.isArray(e.data)) return;
  const [op, d] = e.data;
  const reply = (p) => e.source.postMessage([1, p], location.origin);
  if (op === 0) {
    reply({ cmd: 'DISPATCH', evt: 'READY', nonce: null, data: { v: 1, config: { cdn_host: 'cdn.discordapp.com', api_endpoint: '//discord.com/api', environment: 'production' } } });
    return;
  }
  if (op !== 1) return;
  const { cmd, nonce, args } = d;
  window.__commands.push({ cmd, args });
  let data = {};
  if (cmd === 'AUTHORIZE') data = { code: P.code };
  if (cmd === 'AUTHENTICATE') data = {
    access_token: args.access_token,
    user: { id: P.id, username: P.username, discriminator: '0', avatar: null, public_flags: 0, global_name: P.global_name },
    scopes: ['identify', 'guilds'], expires: '2030-01-01T00:00:00.000Z',
    application: { id: '123456789012345678', name: 'Dota Build Daily', description: '', icon: null },
  };
  if (cmd === 'SHARE_LINK') data = { success: true, didCopyLink: false, didSendMessage: true };
  if (cmd === 'SET_ACTIVITY') data = args.activity;
  if (cmd === 'OPEN_EXTERNAL_LINK') data = { opened: true };
  reply({ cmd, nonce, evt: null, data });
});
</script>`;

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png' };

export const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/host.html') {
    res.writeHead(200, { 'content-type': 'text/html' }).end(HOST_PAGE(url.searchParams.get('as') ?? 'a'));
    return;
  }
  if (url.pathname.startsWith('/api/')) return void api(req, res);
  if (url.pathname.startsWith('/steam/') || url.pathname.startsWith('/discordcdn/')) {
    res.writeHead(404).end(); // no internet here; the game shows text tiles instead
    return;
  }
  let file = normalize(join(DIST, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

if (process.argv[1]?.endsWith('discord-host.ts')) {
  server.listen(PORT, () => console.log(`Fake Discord host on http://localhost:${PORT}/host.html?as=a`));
}
