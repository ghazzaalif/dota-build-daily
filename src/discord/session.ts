// Discord Activity mode. When the page is opened by Discord (it adds frame_id and
// instance_id to the URL), we hand-shake with the client, sign the player in with their
// Discord account, and route outside requests through Discord's proxy.
//
// Outside Discord none of this runs and the website behaves exactly as before.
import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';
import { UMAMI_DISCORD_MAPPINGS } from '../analytics';
import { API_URL, DISCORD_CLIENT_ID } from '../config';
import type { BoardEntry, DiscordUserLite, GameUpload, MyGame, ResultsStatus, ServerStats } from './api';

/** Prefixes must match the URL mappings in the Discord Developer Portal. */
export const URL_MAPPINGS = [
  { prefix: '/steam', target: 'cdn.cloudflare.steamstatic.com' },
  { prefix: '/discordcdn', target: 'cdn.discordapp.com' },
  { prefix: '/api', target: new URL(API_URL).host },
  ...UMAMI_DISCORD_MAPPINGS,
];

export interface DiscordSession {
  sdk: DiscordSDK;
  user: DiscordUserLite;
  accessToken: string;
  guildId: string | null;
  channelId: string | null;
  api: ApiClient;
}

/**
 * The API runs on a free Render instance that sleeps when idle. While it wakes (up to about a
 * minute), requests get Render's "Application loading" HTML page or a 502/503/504 instead of
 * JSON. Treat those, and network errors, as "waking" and retry instead of failing.
 */
export const WAKE_TIMEOUT_MS = 90_000;
const WAKE_DELAYS_MS = [1500, 2500, 4000, 6000];

function isWakingResponse(res: Response): boolean {
  if ([502, 503, 504].includes(res.status)) return true;
  // Render's wake-up page is HTML, often with status 200; our API only ever answers JSON.
  return !(res.headers.get('content-type') ?? '').includes('application/json');
}

export async function apiFetch(
  url: string,
  init: RequestInit,
  opts: { onWaking?: () => void; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Response> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = Date.now() + (opts.timeoutMs ?? WAKE_TIMEOUT_MS);
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(url, init);
      if (!isWakingResponse(res)) return res;
    } catch (e) {
      if (Date.now() >= deadline) throw e;
    }
    if (Date.now() >= deadline) {
      if (res) return res;
      throw new Error('The game server did not wake up in time');
    }
    opts.onWaking?.();
    await sleep(WAKE_DELAYS_MS[Math.min(attempt, WAKE_DELAYS_MS.length - 1)]);
  }
}

export class ApiClient {
  constructor(private token: string) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await apiFetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}`, ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  getGame(date: string) {
    return this.call<{ game: MyGame | null }>(`/game?date=${encodeURIComponent(date)}`).then((r) => r.game);
  }
  saveGame(g: GameUpload) {
    return this.call<{ ok: true; status: MyGame['status'] }>('/game', { method: 'POST', body: JSON.stringify(g) });
  }
  scoreboard(guildId: string, date: string) {
    return this.call<{ entries: BoardEntry[] }>(`/scoreboard?guild_id=${guildId}&date=${encodeURIComponent(date)}`).then((r) => r.entries);
  }
  resultsStatus(guildId: string, channelId: string | null) {
    return this.call<ResultsStatus>(`/results-status?guild_id=${guildId}${channelId ? `&channel_id=${channelId}` : ''}`);
  }
  stats() {
    return this.call<{ stats: ServerStats }>('/stats').then((r) => r.stats);
  }
}

let pending: Promise<DiscordSession> | null = null;
const HANDSHAKE_TIMEOUT_MS = 15_000;

/**
 * Hand-shake + sign-in. Safe to call more than once; the work happens once, unless it failed,
 * in which case the next call tries again. `onWaking` fires while the API server wakes up.
 */
export function startDiscordSession(onWaking?: () => void): Promise<DiscordSession> {
  if (pending) return pending;
  pending = (async () => {
    if (!DISCORD_CLIENT_ID) throw new Error('Discord client ID is not configured');
    // Rewrite fetch and <img src> for the Steam CDN, Discord avatars and our API so they
    // go through the Discord proxy (anything else is blocked by the Activity's CSP).
    patchUrlMappings(URL_MAPPINGS, { patchSrcAttributes: true });

    const sdk = new DiscordSDK(DISCORD_CLIENT_ID);
    await Promise.race([
      sdk.ready(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Discord handshake timed out')), HANDSHAKE_TIMEOUT_MS)),
    ]);

    const { code } = await sdk.commands.authorize({
      client_id: DISCORD_CLIENT_ID,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify', 'guilds'],
    });

    // The sign-in code is single-use, but a sleeping server never received it, so retrying is safe.
    const tokenRes = await apiFetch(
      `${API_URL}/token`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) },
      { onWaking },
    );
    if (!tokenRes.ok) throw new Error(`Sign-in failed (HTTP ${tokenRes.status})`);
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    const auth = await sdk.commands.authenticate({ access_token });
    if (!auth?.user) throw new Error('Discord did not return a user');

    return {
      sdk,
      accessToken: access_token,
      user: {
        id: auth.user.id,
        username: auth.user.username,
        globalName: auth.user.global_name ?? null,
        avatar: auth.user.avatar ?? null,
      },
      guildId: sdk.guildId,
      channelId: sdk.channelId,
      api: new ApiClient(access_token),
    };
  })();
  pending.catch(() => (pending = null));
  return pending;
}
