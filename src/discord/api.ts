// Shapes shared by the client and server/ (the Discord Activity backend).
import type { TileState } from '../game/types';

export interface DiscordUserLite {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

/** What the client sends after every change. Rows are item keys; the server re-scores them. */
export interface GameUpload {
  date: string;
  rows: string[][];
  hintsRevealed: number;
  earlyReveals: number;
  lifeline: { slot: number; key: string } | null;
  guildId: string | null;
}

/** The caller's own saved game (item keys included, so it can resume on another device). */
export interface MyGame {
  date: string;
  rows: string[][];
  hintsRevealed: number;
  earlyReveals: number;
  lifeline: { slot: number; key: string } | null;
  status: 'in_progress' | 'won' | 'lost';
}

/** A server member's game, spoiler-free: tile colors only, never item keys. */
export interface BoardEntry {
  user: DiscordUserLite;
  status: 'in_progress' | 'won' | 'lost';
  rows: number;
  hints: number;
  states: TileState[][];
}

export interface ServerStats {
  played: number;
  wins: number;
  curStreak: number;
  maxStreak: number;
  dist: Record<'1' | '2' | '3' | '4' | '5' | '6' | 'X', number>;
  lastCompleted?: string;
  lastWin?: string;
}

export function avatarUrl(u: DiscordUserLite, size = 64): string {
  if (u.avatar) return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=${size}`;
  // Default avatars are chosen from the user id for new-style usernames.
  const idx = Number((BigInt(u.id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

export const displayName = (u: DiscordUserLite) => u.globalName || u.username;
