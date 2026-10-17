// Discord helpers that don't pull in the SDK, so the website bundle stays small.
// The SDK itself lives in session.ts and is only loaded inside Discord.
import type { DiscordSession } from './session';

export function isDiscordActivity(search = window.location.search): boolean {
  const q = new URLSearchParams(search);
  return q.has('frame_id') && q.has('instance_id');
}

/** Rich presence under the player's name, e.g. "#4: Guess 3 of 6". Failures are ignored. */
export function setPresence(s: DiscordSession, details: string, state?: string) {
  s.sdk.commands.setActivity({ activity: { type: 0, details, state } }).catch(() => undefined);
}

/** Links can't open from inside the Activity iframe; Discord opens them for us. */
export function openExternal(s: DiscordSession | null, url: string) {
  if (s) s.sdk.commands.openExternalLink({ url }).catch(() => window.open(url, '_blank', 'noopener'));
  else window.open(url, '_blank', 'noopener');
}

export const loadSession = () => import('./session').then((m) => m.startDiscordSession());
