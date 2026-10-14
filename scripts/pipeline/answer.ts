// Building the answer (PRD §7.4, revised 2026-10-14): the player's 6 MAIN inventory
// slots at the end of the game, ordered by when each item was bought.
// Backpack and neutral slots are ignored. A player qualifies only when all 6 main
// slots hold distinct eligible items (S5).
import { BUILD_SIZE } from '../../src/config';
import type { AnswerEntry } from '../../src/game/types';
import { isEligible, normalizeKey, type ItemRules, type RawItems } from './eligibility';
import type { ODPlayer } from './opendota';

export type AnswerResult = { ok: true; answer: AnswerEntry[] } | { ok: false; reason: string };

/** item id → item key (OpenDota match JSON stores final items as numeric IDs). */
export function idToKeyMap(raw: RawItems): Map<number, string> {
  const m = new Map<number, string>();
  for (const [key, item] of Object.entries(raw)) if (typeof item.id === 'number') m.set(item.id, key);
  return m;
}

export function finalInventory(p: ODPlayer, ids: Map<number, string>): (string | null)[] {
  return [p.item_0, p.item_1, p.item_2, p.item_3, p.item_4, p.item_5].map((id) => (id ? ids.get(id) ?? `unknown_${id}` : null));
}

/**
 * When the held copy was bought: the LAST purchase of that exact key (a sold-and-rebought
 * item counts from the rebuy). Falls back to first_purchase_time when there is no log.
 */
function purchaseTime(p: ODPlayer, key: string): { time: number; idx: number } | null {
  const log = p.purchase_log ?? [];
  for (let i = log.length - 1; i >= 0; i--) if (log[i].key === key) return { time: log[i].time, idx: i };
  const t = p.first_purchase_time?.[key];
  return typeof t === 'number' ? { time: t, idx: 0 } : null;
}

export function buildAnswer(p: ODPlayer, raw: RawItems, rules: ItemRules, ids = idToKeyMap(raw)): AnswerResult {
  const slots = finalInventory(p, ids);
  if (slots.some((k) => !k)) return { ok: false, reason: 'empty main inventory slot' };

  const entries: (AnswerEntry & { idx: number })[] = [];
  for (const rawKey of slots as string[]) {
    const key = normalizeKey(rules, rawKey); // dagon_3 → dagon, travel_boots_2 → travel_boots
    if (!isEligible(raw, rules, key)) return { ok: false, reason: `ineligible item in main slots: ${rawKey}` };
    if (entries.some((e) => e.key === key)) return { ok: false, reason: `duplicate item: ${key}` };
    const t = purchaseTime(p, rawKey);
    if (!t) return { ok: false, reason: `${rawKey} not in purchase log (picked up or log incomplete)` };
    entries.push({ key, timeSec: t.time, idx: t.idx });
  }
  entries.sort((a, b) => a.timeSec - b.timeSec || a.idx - b.idx);
  return { ok: true, answer: entries.slice(0, BUILD_SIZE).map(({ key, timeSec }) => ({ key, timeSec })) };
}
