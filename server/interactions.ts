// Discord interactions endpoint: the "Play now!" button on the results card, the entry
// point command (if its handler is ever switched to the app), and /results-channel.
// https://discord.com/developers/docs/interactions/receiving-and-responding
import { createPublicKey, verify } from 'node:crypto';
import { LAUNCH_BUTTON_ID } from './results';
import type { Store } from './store';

export const RESULTS_CHANNEL_COMMAND = {
  name: 'results-channel',
  type: 1,
  description: 'Choose the channel where Dota Build Daily posts the daily results card',
  options: [
    {
      type: 7,
      name: 'channel',
      description: 'Leave empty to post in whichever channel the game was opened',
      required: false,
      channel_types: [0, 5],
    },
  ],
  default_member_permissions: String(1 << 5), // Manage Server
  contexts: [0],
  integration_types: [0],
};

const MANAGE_GUILD = 1n << 5n;
const EPHEMERAL = 1 << 6;

const reply = (content: string) => ({ type: 4, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] } } });

/** Ed25519 check Discord requires on every request (it also sends deliberately bad ones). */
export function verifySignature(publicKeyHex: string, signatureHex: string, timestamp: string, body: Buffer): boolean {
  if (!/^[0-9a-f]{64}$/i.test(publicKeyHex) || !/^[0-9a-f]{128}$/i.test(signatureHex) || !timestamp) return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKeyHex, 'hex')]),
      format: 'der',
      type: 'spki',
    });
    return verify(null, Buffer.concat([Buffer.from(timestamp), body]), key, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}

interface Interaction {
  type: number;
  guild_id?: string;
  member?: { permissions?: string };
  data?: { type?: number; name?: string; custom_id?: string; options?: { name: string; value: unknown }[] };
}

export function createInteractions(deps: { store: Store; publicKey: string }) {
  return async function handle(raw: Buffer, headers: Record<string, string | string[] | undefined>): Promise<{ status: number; body: unknown }> {
    const sig = String(headers['x-signature-ed25519'] ?? '');
    const ts = String(headers['x-signature-timestamp'] ?? '');
    if (!verifySignature(deps.publicKey, sig, ts, raw)) return { status: 401, body: { error: 'invalid request signature' } };

    let i: Interaction;
    try {
      i = JSON.parse(raw.toString('utf8')) as Interaction;
    } catch {
      return { status: 400, body: { error: 'bad json' } };
    }

    if (i.type === 1) return { status: 200, body: { type: 1 } }; // PING → PONG

    // "Play now!" on the results card, or the App Launcher entry point → open the Activity.
    if (i.type === 3 && i.data?.custom_id === LAUNCH_BUTTON_ID) return { status: 200, body: { type: 12 } };
    if (i.type === 2 && i.data?.type === 4) return { status: 200, body: { type: 12 } };

    if (i.type === 2 && i.data?.name === RESULTS_CHANNEL_COMMAND.name) {
      if (!i.guild_id) return { status: 200, body: reply('Use this in a server.') };
      if (!(BigInt(i.member?.permissions ?? '0') & MANAGE_GUILD)) return { status: 200, body: reply('You need the Manage Server permission to change this.') };
      const ch = i.data.options?.find((o) => o.name === 'channel')?.value;
      const channelId = typeof ch === 'string' && /^\d{5,25}$/.test(ch) ? ch : null;
      await deps.store.setResultsChannel(i.guild_id, channelId);
      return {
        status: 200,
        body: reply(
          channelId
            ? `Done. Dota Build Daily results will be posted in <#${channelId}>. Make sure I can send messages and attach files there.`
            : 'Done. Results will be posted in whichever channel the game was opened.',
        ),
      };
    }

    return { status: 200, body: reply("I don't know that one.") };
  };
}
