// F1: one puzzle per UTC date; reset at RESET_UTC_HOUR (00:00 UTC = 07:00 WIB).
import { LAUNCH_DATE, RESET_UTC_HOUR } from '../config';

const DAY_MS = 86_400_000;

/** The puzzle date (YYYY-MM-DD) active at `now`. */
export function puzzleDateAt(now: Date): string {
  return new Date(now.getTime() - RESET_UTC_HOUR * 3_600_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Puzzle # = days since launch + 1. */
export const puzzleNumber = (date: string) => daysBetween(LAUNCH_DATE, date) + 1;

export function msUntilNextReset(now: Date): number {
  const next = Date.parse(`${addDays(puzzleDateAt(now), 1)}T00:00:00Z`) + RESET_UTC_HOUR * 3_600_000;
  return Math.max(0, next - now.getTime());
}

export function formatCountdown(ms: number): string {
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * §12 clock skew: prefer the server's Date header when it's available.
 * Returns the offset (server − device) in ms, or 0 if unknown/unreasonable.
 */
export function clockOffsetFromHeader(header: string | null, deviceNow = Date.now()): number {
  if (!header) return 0;
  const server = Date.parse(header);
  return Number.isNaN(server) ? 0 : server - deviceNow;
}
