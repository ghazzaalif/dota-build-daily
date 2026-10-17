// Config constants (PRD §9.5). Shared by the client and the puzzle pipeline.

export const MAX_ROWS = 6;
export const BUILD_SIZE = 6;
/** §7.3(a): recipe/assembled items must cost at least this much to be eligible. */
export const MIN_ITEM_COST = 1000;
/** §5.3: components at or above this cost count as "significant" for 🟧. */
export const SHARED_COMPONENT_MIN_COST = 1000;
/** §7.2 S4 */
export const MIN_DURATION_MIN = 25;
/** §7.2 S3: below this many current-patch candidates, the previous patch is allowed. */
export const MIN_POOL_SIZE = 30;
/** §7.2 S7 */
export const HERO_COOLDOWN_DAYS = 14;
export const MATCH_COOLDOWN_DAYS = 180;
/** §8: days of future puzzles kept in the private queue. */
export const QUEUE_DAYS = 7;
/** §8: alert when the queue drops below this many days. */
export const QUEUE_ALERT_DAYS = 3;
/** F1: daily reset hour in UTC. */
export const RESET_UTC_HOUR = 0;
/** F1: puzzle #1 is published on this UTC date. */
export const LAUNCH_DATE = '2026-10-14';
/** §7.2 S8: at most this many support (pos 4–5) puzzles in any 7-day window. */
export const MAX_SUPPORT_PER_WEEK = 2;

/** §5.4 hint "price band per slot". Edges in gold; the last band is open-ended. */
export const PRICE_BAND_EDGES = [2000, 3500, 4500, 5500];

export const SITE_URL = 'https://dota-build-daily.onrender.com';
export const GAME_NAME = 'Dota Build Daily';

/**
 * Discord Activity. The client ID is public (it's in every Activity URL). The API is the
 * small backend in server/ that exchanges OAuth codes and keeps the server scoreboard.
 * Both can be overridden at build time with VITE_DISCORD_CLIENT_ID / VITE_API_URL.
 * (`?.` because the server imports this file too, where import.meta.env doesn't exist.)
 */
export const DISCORD_CLIENT_ID: string = import.meta.env?.VITE_DISCORD_CLIENT_ID ?? '';
export const API_URL: string = import.meta.env?.VITE_API_URL ?? 'https://dota-build-daily-api.onrender.com';
/** How often the "played in this server" list refreshes while open. */
export const SCOREBOARD_POLL_MS = 20_000;
