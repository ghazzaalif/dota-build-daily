// Posts the day's results card in a Discord channel when someone finishes, and edits that
// same message as more people finish (one message per channel per day, like Wordle).
import { avatarUrl, displayName } from '../src/discord/api';
import type { Content } from './app';
import { renderCard, type CardPlayer } from './card';
import { sortBoard } from './logic';
import type { Store } from './store';

/** The bot's side of the Discord API (fake in tests). */
export interface BotApi {
  /** The server a channel belongs to, or null if the bot can't see it. */
  channelGuild(channelId: string): Promise<string | null>;
  createMessage(channelId: string, msg: OutgoingMessage): Promise<string>;
  /** false when the message no longer exists (someone deleted it). */
  editMessage(channelId: string, messageId: string, msg: OutgoingMessage): Promise<boolean>;
  fetchImage(url: string): Promise<Buffer | null>;
}

export interface OutgoingMessage {
  content: string;
  png: Buffer;
  filename: string;
}

export const LAUNCH_BUTTON_ID = 'launch';

/** "A", "A and B", "A, B and C", "A, B, C and 4 others" */
export function namesLine(names: string[]): string {
  const bold = (n: string) => `**${n.replace(/([*_~`|\\])/g, '\\$1')}**`;
  if (names.length <= 3) {
    const b = names.map(bold);
    return b.length < 2 ? b.join('') : `${b.slice(0, -1).join(', ')} and ${b[b.length - 1]}`;
  }
  const rest = names.length - 3;
  return `${names.slice(0, 3).map(bold).join(', ')} and ${rest} other${rest === 1 ? '' : 's'}`;
}

/** Minutes to wait before trying a failed post again (Discord can block shared IPs for a while). */
const RETRY_MS = [1, 3, 10, 30, 60].map((m) => m * 60_000);

export function createResultsPublisher(deps: { store: Store; content: Content; bot: BotApi; retryMs?: number[] }) {
  const retryMs = deps.retryMs ?? RETRY_MS;
  const queues = new Map<string, Promise<void>>();
  const channelGuilds = new Map<string, string | null>();

  async function channelInGuild(channelId: string, guildId: string) {
    if (!channelGuilds.has(channelId)) {
      const g = await deps.bot.channelGuild(channelId);
      if (!g) return false; // not cached: the bot may be added to the server later
      channelGuilds.set(channelId, g);
    }
    return channelGuilds.get(channelId) === guildId;
  }

  async function publishNow(guildId: string, date: string, openedIn: string | null) {
    const channelId = (await deps.store.getResultsChannel(guildId)) ?? openedIn;
    if (!channelId || !(await channelInGuild(channelId, guildId))) return;
    const puzzle = await deps.content.puzzle(date);
    if (!puzzle) return;

    const finished = (await deps.store.board(guildId, date)).filter((r) => r.game.status !== 'in_progress');
    if (!finished.length) return;
    const sorted = sortBoard(
      finished.map((r) => ({ ...r, name: displayName(r.user), status: r.game.status, rows: r.game.rows.length, hints: r.game.earlyReveals })),
    );
    const players: CardPlayer[] = await Promise.all(
      sorted.map(async (r) => ({
        name: r.name,
        avatar: await deps.bot.fetchImage(avatarUrl(r.user, 128)),
        status: r.game.status,
        states: r.game.states,
      })),
    );
    const n = players.length;
    const msg: OutgoingMessage = {
      content: `${namesLine(players.map((p) => p.name))} ${n === 1 ? 'has' : 'have'} played Dota Build Daily #${puzzle.puzzleNo}`,
      png: await renderCard({ puzzleNo: puzzle.puzzleNo, players }),
      filename: `dota-build-daily-${puzzle.puzzleNo}.png`,
    };

    const existing = await deps.store.getPost(guildId, date, channelId);
    if (existing && (await deps.bot.editMessage(channelId, existing, msg))) return;
    const id = await deps.bot.createMessage(channelId, msg);
    await deps.store.savePost(guildId, date, channelId, id);
  }

  /** Queued per server and day so two people finishing at once can't post two cards. */
  function publish(guildId: string, date: string, openedIn: string | null, attempt = 0): Promise<void> {
    const key = `${guildId}:${date}`;
    const next = (queues.get(key) ?? Promise.resolve())
      .then(() => publishNow(guildId, date, openedIn))
      .catch((e) => {
        const wait = retryMs[attempt];
        console.error(`results card for ${key} failed${wait !== undefined ? `; retrying in ${Math.round(wait / 60_000)} min` : ''}:`, e);
        if (wait !== undefined) setTimeout(() => void publish(guildId, date, openedIn, attempt + 1), wait).unref?.();
      });
    queues.set(key, next);
    void next.then(() => queues.get(key) === next && queues.delete(key));
    return next;
  }

  return { publish };
}
