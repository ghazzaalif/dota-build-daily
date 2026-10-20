// Generates public/data/items.json and heroes.json (PRD §9.2) from constants + item-rules.json.
// Usage: tsx scripts/pipeline/build-items.ts [--offline]
import { join } from 'node:path';
import type { Pos } from '../../src/game/draft/types';
import type { HeroAttr, HeroesMap, ItemsMap } from '../../src/game/types';
import { currentPatch, loadConstants, patchName, type Constants } from './constants';
import { loadAllDraftSources } from './draft';
import { buildItemsMap, type ItemRules } from './eligibility';
import { readJson, writeJson, type ODMatch } from './opendota';
import { countPositions, typicalPosFrom } from './typicalPos';

const HERO_CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/';

export function loadRules(): ItemRules {
  const rules = readJson<ItemRules>(join(process.cwd(), 'data', 'item-rules.json'));
  if (!rules) throw new Error('data/item-rules.json missing');
  return rules;
}

/** data/hero-rules.json (Draft PRD §9.3), hand-maintained. */
export interface HeroRules {
  aliases: Record<string, string[]>;
  defaultPos: Record<string, Pos>;
  exclude: string[];
}

export function loadHeroRules(): HeroRules {
  return readJson<HeroRules>(join(process.cwd(), 'data', 'hero-rules.json')) ?? { aliases: {}, defaultPos: {}, exclude: [] };
}

/**
 * heroes.json (both modes). Draft adds attr, attack type, nicknames and typicalPos (§7.5),
 * computed from `draftMatches` on the current patch, falling back to hero-rules defaultPos.
 */
export function buildHeroesMap(c: Constants, heroRules: HeroRules = loadHeroRules(), draftMatches: ODMatch[] = []): HeroesMap {
  const patch = currentPatch(c).name;
  const counts = countPositions(draftMatches.filter((m) => patchName(c, m.patch) === patch));
  const out: HeroesMap = {};
  for (const h of Object.values(c.heroes)) {
    const key = h.name.replace('npc_dota_hero_', '');
    if (heroRules.exclude.includes(key)) continue;
    const raw = h as typeof h & { primary_attr?: string; attack_type?: string };
    out[h.id] = {
      id: h.id,
      key,
      name: h.localized_name,
      img: `${HERO_CDN}${key}.png`,
      attr: (['str', 'agi', 'int', 'all'].includes(raw.primary_attr ?? '') ? raw.primary_attr : 'all') as HeroAttr,
      attackType: raw.attack_type === 'Ranged' ? 'ranged' : 'melee',
      typicalPos: typicalPosFrom(counts.get(h.id)) ?? heroRules.defaultPos[key] ?? 3,
      aliases: heroRules.aliases[key] ?? [],
    };
  }
  return out;
}

export function writeHeroes(heroes: HeroesMap) {
  writeJson(join(process.cwd(), 'public', 'data', 'heroes.json'), heroes);
}

export function writeClientData(c: Constants, rules: ItemRules): { items: ItemsMap; heroes: HeroesMap } {
  const items = buildItemsMap(c.items, rules);
  const heroes = buildHeroesMap(c, loadHeroRules(), loadAllDraftSources());
  writeJson(join(process.cwd(), 'public', 'data', 'items.json'), items);
  writeJson(join(process.cwd(), 'public', 'data', 'heroes.json'), heroes);
  return { items, heroes };
}

const isMain = process.argv[1]?.endsWith('build-items.ts');
if (isMain) {
  const offline = process.argv.includes('--offline');
  const c = await loadConstants(offline);
  const { items, heroes } = writeClientData(c, loadRules());
  const eligible = Object.values(items).filter((i) => i.eligible);
  console.log(`items.json: ${eligible.length} eligible items (+${Object.keys(items).length - eligible.length} components)`);
  console.log(`heroes.json: ${Object.keys(heroes).length} heroes`);
  const missing = Object.keys(loadRules().categories).filter((k) => !c.items[k]);
  if (missing.length) console.warn(`⚠ categories reference unknown items: ${missing.join(', ')}`);
}
