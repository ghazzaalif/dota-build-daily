// Tells a Discord player why their result wasn't posted in the server, and how to fix it.
// Shown on the end screen only when something is wrong; silent when the card posts fine.
import { DISCORD_CLIENT_ID } from '../config';
import type { ResultsStatus } from '../discord/api';

export const botInstallUrl = (guildId: string) =>
  `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&scope=bot+applications.commands&permissions=117760&integration_type=0&guild_id=${guildId}&disable_guild_select=true`;

const PERMS = 'View Channel, Send Messages and Attach Files';

export function ResultsNotice({ status, guildId, onOpenLink }: { status: ResultsStatus | null; guildId: string; onOpenLink: (url: string) => void }) {
  if (!status || status.state === 'ok' || status.state === 'off' || status.state === 'no_channel') return null;
  const where = status.fixedChannel ? 'the results channel set with /results-channel' : 'this channel';
  return (
    <div role="status" className="rounded-[4px] border border-line bg-raised p-3 text-small">
      {status.state === 'no_bot' ? (
        <>
          <p className="font-semibold">Your result wasn't posted in this server</p>
          <p className="mt-1 text-muted">
            The Dota Build Daily bot hasn't been added here, so it can't post the daily results card. Anyone with the Manage Server permission can add it.
          </p>
          <button type="button" onClick={() => onOpenLink(botInstallUrl(guildId))} className="mt-2 h-11 w-full rounded-[3px] bg-ink font-bold text-bg">
            Add the bot to this server
          </button>
        </>
      ) : status.state === 'no_channel_access' ? (
        <>
          <p className="font-semibold">The bot can't see {where}</p>
          <p className="mt-1 text-muted">
            Give the Dota Build Daily bot {PERMS} there, or have an admin run <b className="text-ink">/results-channel</b> to pick a channel it can post in.
          </p>
        </>
      ) : (
        <>
          <p className="font-semibold">The bot couldn't post your result in {where}</p>
          <p className="mt-1 text-muted">
            It's in the server but is missing a permission there. Give it {PERMS}, or have an admin run <b className="text-ink">/results-channel</b> to pick another channel.
          </p>
        </>
      )}
    </div>
  );
}
