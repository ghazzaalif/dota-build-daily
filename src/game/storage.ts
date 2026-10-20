// F8 persistence in localStorage (PRD §9.4). Works without storage (private mode).
import { addDays } from './date';

export type GameStatus = 'in_progress' | 'won' | 'lost';

export interface SavedGame {
  rows: string[][];
  /** Highest hint level unlocked so far (auto or early). */
  hintsRevealed: number;
  /** Hints revealed early (💡N in the share text). */
  earlyReveals: number;
  /** Row-5 lifeline: slot index and item, locked in later rows. */
  lifeline?: { slot: number; key: string } | null;
  status: GameStatus;
  /** Work-in-progress row so a refresh keeps it. */
  draft?: (string | null)[];
}

export interface Stats {
  played: number;
  wins: number;
  curStreak: number;
  maxStreak: number;
  dist: Record<'1' | '2' | '3' | '4' | '5' | '6' | 'X', number>;
  /** Date of the last completed puzzle and the last win (for streak rules). */
  lastCompleted?: string;
  lastWin?: string;
}

export interface Settings {
  colorblind: boolean;
  keepGreens: boolean;
  seenTutorial: boolean;
  theme: 'system' | 'dark' | 'light';
  reducedMotion: 'system' | 'on' | 'off';
  hintConfirmSeen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  colorblind: false,
  keepGreens: true,
  seenTutorial: false,
  theme: 'system',
  reducedMotion: 'system',
  hintConfirmSeen: false,
};

export const emptyStats = (): Stats => ({
  played: 0,
  wins: 0,
  curStreak: 0,
  maxStreak: 0,
  dist: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, X: 0 },
});

const K = {
  stats: 'dbd:v1:stats',
  settings: 'dbd:v1:settings',
  active: 'dbd:v1:active',
  game: (date: string) => `dbd:v1:game:${date}`,
};

let memory: Record<string, string> = {};
let available: boolean | null = null;

export function storageAvailable(): boolean {
  if (available !== null) return available;
  try {
    const t = '__dbd_test__';
    localStorage.setItem(t, t);
    localStorage.removeItem(t);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export function read<T>(key: string): T | null {
  try {
    const raw = storageAvailable() ? localStorage.getItem(key) : memory[key];
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function write(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  try {
    if (storageAvailable()) localStorage.setItem(key, raw);
    else memory[key] = raw;
  } catch {
    // Full storage: keep playing in memory (§12).
    available = false;
    memory[key] = raw;
  }
}

export const loadGame = (date: string) => read<SavedGame>(K.game(date));
export const saveGame = (date: string, g: SavedGame) => write(K.game(date), g);
export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(K.settings) ?? {}) });
export const saveSettings = (s: Settings) => write(K.settings, s);
export const loadStats = (): Stats => ({ ...emptyStats(), ...(read<Stats>(K.stats) ?? {}) });
export const saveStats = (s: Stats) => write(K.stats, s);
export const loadActiveDate = () => read<string>(K.active);
export const saveActiveDate = (d: string) => write(K.active, d);

/** Test helper. */
export function _resetStorageForTests() {
  memory = {};
  available = null;
}

/**
 * Records a finished puzzle. Streak continues only when the previous puzzle date
 * was also won; skipping a day or losing breaks it. Idempotent per date.
 */
export function recordResult(stats: Stats, date: string, won: boolean, rows: number): Stats {
  if (stats.lastCompleted && stats.lastCompleted >= date) return stats;
  const s: Stats = { ...stats, dist: { ...stats.dist } };
  s.played += 1;
  s.lastCompleted = date;
  if (won) {
    s.wins += 1;
    s.curStreak = s.lastWin === addDays(date, -1) ? s.curStreak + 1 : 1;
    s.maxStreak = Math.max(s.maxStreak, s.curStreak);
    s.lastWin = date;
    s.dist[String(rows) as keyof Stats['dist']] += 1;
  } else {
    s.curStreak = 0;
    s.dist.X += 1;
  }
  return s;
}

/** The streak to display today: it's already broken if neither today nor yesterday was won. */
export function displayStreak(stats: Stats, today: string): number {
  if (!stats.lastWin) return 0;
  return stats.lastWin === today || stats.lastWin === addDays(today, -1) ? stats.curStreak : 0;
}
