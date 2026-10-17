// Registers the bot's slash commands (/results-channel). The API server does this on
// start-up too; this script is for running it from somewhere else (GitHub Actions) when
// Discord is blocking the server's IP.  DISCORD_BOT_TOKEN=… npx tsx scripts/register-commands.mts
import { DISCORD_CLIENT_ID } from '../src/config';
import { RESULTS_CHANNEL_COMMAND } from '../server/interactions';

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) throw new Error('DISCORD_BOT_TOKEN is not set');
const res = await fetch(`https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/commands`, {
  method: 'POST', // upserts by name; leaves the Activity's entry point command alone
  headers: { authorization: `Bot ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify(RESULTS_CHANNEL_COMMAND),
});
const text = await res.text();
if (!res.ok) throw new Error(`Discord said ${res.status}: ${text.slice(0, 300)}`);
console.log(`/${RESULTS_CHANNEL_COMMAND.name} registered (${res.status})`);
