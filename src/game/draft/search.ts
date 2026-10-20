// Draft F4 hero search: name + nickname, same fuzzy scoring as the item picker.
import { norm, scoreTerm } from '../search';
import type { HeroInfo } from '../types';

export interface HeroEntry {
  hero: HeroInfo;
  terms: string[];
  aliasCount: number;
}

export function buildHeroIndex(heroes: Record<string, HeroInfo>): HeroEntry[] {
  return Object.values(heroes).map((hero) => {
    const aliases = (hero.aliases ?? []).map(norm);
    return {
      hero,
      aliasCount: aliases.length,
      // [name, name w/o spaces, ...aliases, key]
      terms: [norm(hero.name), norm(hero.name).replace(/ /g, ''), ...aliases, norm(hero.key.replace(/_/g, ' '))],
    };
  });
}

export function searchHeroes(index: HeroEntry[], query: string, limit = 40): HeroEntry[] {
  const q = norm(query);
  if (!q) return index;
  const scored: { e: HeroEntry; s: number }[] = [];
  for (const e of index) {
    let best = 0;
    e.terms.forEach((t, i) => (best = Math.max(best, scoreTerm(q, t, i >= 2 && i < 2 + e.aliasCount))));
    if (best > 0) scored.push({ e, s: best });
  }
  scored.sort((a, b) => b.s - a.s || a.e.hero.name.localeCompare(b.e.hero.name));
  return scored.slice(0, limit).map((x) => x.e);
}
