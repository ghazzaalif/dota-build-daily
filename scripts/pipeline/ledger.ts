// Draft PRD §8: the shared used-match ledger. One record per scheduled match {matchId, mode,
// date}; a match used by either mode can never be used by the other (D9), because Build
// shows the whole draft as its row-1 hint and Draft's end screen shows every pick.
// The ledger is derived from both modes' private histories, so it needs no file of its own.
import type { HistoryEntry } from './schedule';
import type { DraftHistoryEntry } from './draft';

export interface LedgerEntry {
  matchId: number;
  mode: 'build' | 'draft';
  date: string;
}

export function buildLedger(build: HistoryEntry[], draft: DraftHistoryEntry[]): LedgerEntry[] {
  return [
    ...build.map((h) => ({ matchId: h.matchId, mode: 'build' as const, date: h.date })),
    ...draft.map((h) => ({ matchId: h.matchId, mode: 'draft' as const, date: h.date })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.mode.localeCompare(b.mode));
}

/** Match IDs the given mode may not use because the other mode has them. */
export function blockedFor(mode: 'build' | 'draft', ledger: LedgerEntry[]): Set<number> {
  return new Set(ledger.filter((e) => e.mode !== mode).map((e) => e.matchId));
}
