// PRD §7.3 item eligibility and §5.3 significant components.
// Pure functions over OpenDota-shaped item constants so they can be unit-tested.
import { MIN_ITEM_COST, SHARED_COMPONENT_MIN_COST } from '../../src/config';
import type { Category, ItemInfo, ItemsMap } from '../../src/game/types';

export interface RawItem {
  id: number;
  dname?: string;
  cost?: number | null;
  img?: string;
  components?: (string | null)[] | null;
  tier?: number;
  qual?: string;
}
export type RawItems = Record<string, RawItem>;

export interface ItemRules {
  exclude: string[];
  standaloneAllow: string[];
  upgradedBoots: string[];
  levelNormalize: Record<string, string>;
  categories: Record<string, Category>;
  aliases: Record<string, string[]>;
}

const CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/';

export function componentsOf(raw: RawItems, key: string): string[] {
  return (raw[key]?.components ?? []).filter(
    (c): c is string => typeof c === 'string' && c.length > 0 && !c.startsWith('recipe_'),
  );
}

/** Recursive component tree, recipes excluded, the item itself excluded. */
export function componentTree(raw: RawItems, key: string, seen = new Set<string>()): string[] {
  for (const c of componentsOf(raw, key)) {
    if (seen.has(c)) continue;
    seen.add(c);
    componentTree(raw, c, seen);
  }
  return [...seen];
}

/** A component is significant when it costs ≥ threshold or is itself assembled (intermediate). */
export function isSignificant(raw: RawItems, key: string, minCost = SHARED_COMPONENT_MIN_COST): boolean {
  const item = raw[key];
  if (!item) return false;
  return (item.cost ?? 0) >= minCost || componentsOf(raw, key).length > 0;
}

export function significantComponents(raw: RawItems, key: string, minCost = SHARED_COMPONENT_MIN_COST): string[] {
  return componentTree(raw, key)
    .filter((c) => isSignificant(raw, c, minCost))
    .sort((a, b) => (raw[b]?.cost ?? 0) - (raw[a]?.cost ?? 0) || a.localeCompare(b));
}

export function normalizeKey(rules: ItemRules, key: string): string {
  return rules.levelNormalize[key] ?? key;
}

export type IneligibleReason =
  | 'unknown'
  | 'recipe'
  | 'neutral'
  | 'excluded'
  | 'not-in-shop'
  | 'plain-boots'
  | 'too-cheap'
  | 'base-item';

/** Returns null when eligible, otherwise the first failing rule (handy for review tooling). */
export function ineligibleReason(raw: RawItems, rules: ItemRules, key: string): IneligibleReason | null {
  const item = raw[key];
  if (!item) return 'unknown';
  if (key.startsWith('recipe_')) return 'recipe';
  if (item.tier) return 'neutral'; // neutral items carry a tier
  if (rules.exclude.includes(key)) return 'excluded';
  if (!rules.categories[key]) return 'not-in-shop';
  if (key === 'boots') return 'plain-boots';
  if (rules.upgradedBoots.includes(key)) return null; // §7.3(b)
  if (rules.standaloneAllow.includes(key)) return null; // §7.3(c)
  if (componentsOf(raw, key).length === 0) return 'base-item';
  if ((item.cost ?? 0) < MIN_ITEM_COST) return 'too-cheap'; // §7.3(a)
  return null;
}

export function isEligible(raw: RawItems, rules: ItemRules, key: string): boolean {
  return ineligibleReason(raw, rules, key) === null;
}

export function imgUrl(raw: RawItems, key: string): string {
  const file = raw[key]?.img?.split('/').pop()?.split('?')[0] ?? `${key}.png`;
  return CDN + file;
}

/**
 * Builds public/data/items.json: every eligible item plus every item that appears in
 * an eligible item's component tree (needed for 🟧 tooltips and price bands).
 */
export function buildItemsMap(raw: RawItems, rules: ItemRules): ItemsMap {
  const out: ItemsMap = {};
  const eligible = Object.keys(raw).filter((k) => isEligible(raw, rules, k));
  const referenced = new Set<string>();
  for (const k of eligible) componentTree(raw, k).forEach((c) => referenced.add(c));

  const add = (key: string, isElig: boolean) => {
    const r = raw[key];
    out[key] = {
      id: r.id,
      name: r.dname ?? key,
      cost: r.cost ?? 0,
      category: (rules.categories[key] ?? null) as Category,
      img: imgUrl(raw, key),
      aliases: rules.aliases[key] ?? [],
      components: componentsOf(raw, key),
      significantComponents: isElig ? significantComponents(raw, key) : [],
      eligible: isElig,
    } satisfies ItemInfo;
  };
  for (const k of [...eligible].sort()) add(k, true);
  for (const k of [...referenced].sort()) if (!out[k]) add(k, false);
  return out;
}
