// F4 picker search: name + alias, with a light fuzzy match.
import type { ItemInfo } from './types';

export interface SearchEntry {
  key: string;
  item: ItemInfo;
  terms: string[];
}

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9&]+/g, ' ')
    .trim();

export function buildIndex(items: Record<string, ItemInfo>): SearchEntry[] {
  return Object.entries(items)
    .filter(([, i]) => i.eligible)
    .map(([key, item]) => ({
      key,
      item,
      terms: [norm(item.name), norm(item.name).replace(/ /g, ''), ...item.aliases.map(norm), norm(key.replace(/_/g, ' '))],
    }));
}

/** Characters of q appear in t in order (e.g. "blkb" ~ "black king bar"). */
export function isSubsequence(q: string, t: string): boolean {
  let i = 0;
  for (const ch of t) if (ch === q[i]) i++;
  return i === q.length;
}

function initials(t: string): string {
  return t
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('');
}

export function scoreTerm(q: string, t: string, isAlias: boolean): number {
  if (t === q) return isAlias ? 100 : 95;
  if (t.startsWith(q)) return 80 - Math.min(t.length - q.length, 20) / 2;
  if (t.split(' ').some((w) => w.startsWith(q))) return 65;
  if (initials(t).startsWith(q) && q.length >= 2) return 60;
  if (t.includes(q)) return 50;
  if (q.length >= 3 && isSubsequence(q.replace(/ /g, ''), t.replace(/ /g, ''))) return 25;
  return 0;
}

export function searchItems(index: SearchEntry[], query: string, limit = 60): SearchEntry[] {
  const q = norm(query);
  if (!q) return index;
  const scored: { e: SearchEntry; s: number }[] = [];
  for (const e of index) {
    let best = 0;
    e.terms.forEach((t, i) => {
      // terms[0..1] are the display name, terms[2..] are aliases + key
      best = Math.max(best, scoreTerm(q, t, i >= 2 && i < 2 + e.item.aliases.length));
    });
    if (best > 0) scored.push({ e, s: best });
  }
  scored.sort((a, b) => b.s - a.s || a.e.item.name.localeCompare(b.e.item.name));
  return scored.slice(0, limit).map((x) => x.e);
}
